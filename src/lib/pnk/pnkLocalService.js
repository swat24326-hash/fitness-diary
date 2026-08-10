import { deleteClientAndAllData, listMemberships } from '../dataAccess.js'
import { todayLocalIso } from '../dateRu.js'
import { pickUsableMembershipForDate } from '../membershipRules.js'
import { ensureMembershipTypesForClub } from '../membershipTypesService.js'
import { listClientsByClubId, listPnkFunnelEventsByClubId } from '../localDbClubQuery.js'
import { saveLocalWithSync } from '../syncService.js'
import { canFullyDeleteClientOnPnkRefuse } from '../membershipHallCore.js'
import { applyPnkStagePatch, buildNewPnkClientFields, isOpenPnkClient } from './pnkStagesCore.js'
import { normalizeClientPnkFields } from './pnkClientFields.js'
import { buildPnkLostFunnelEvent } from './pnkFunnelEventsCore.js'
import {
  buildPnkNewWorkoutPath,
  buildPnkTrialMembershipRow,
  resolvePnkStartTrainingAction,
} from './pnkTrialTrainingCore.js'
import { normalizePnkTrialSessions } from './pnkWizardCore.js'
import { aggregatePnkFunnelStats } from './pnkStatsAgg.js'

/**
 * Локальные цифры ПНК для статистики (индексы IDB по клубу, без getAll всего store).
 * @param {{
 *   clubId?: string | null,
 *   dateFrom: string,
 *   dateTo: string,
 *   trainerId?: string | null,
 * }} opts
 */
export async function loadLocalPnkFunnelUiStats({ clubId, dateFrom, dateTo, trainerId = '' }) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null

  const clients = (await listClientsByClubId(cid)).filter((c) => !c?.archived_at)
  let events = []
  try {
    events = await listPnkFunnelEventsByClubId(cid)
  } catch {
    events = []
  }

  const agg = aggregatePnkFunnelStats(
    clients,
    {
      dateFrom,
      dateTo,
      trainerId: trainerId ? String(trainerId) : '',
    },
    events,
  )

  return {
    entered: agg.entered,
    won: agg.won,
    lost: agg.lost,
    open: agg.open,
    conversionPct: agg.conversionPct,
    nutritionPct: agg.nutritionPct,
    homeworkPct: agg.homeworkPct,
    packageDone: agg.packageDone,
    trialDone: agg.trialDone,
    trainers: agg.trainers ?? [],
  }
}

/**
 * Локальное обновление ПНК на планшете тренера (очередь sync).
 * @param {object} client
 * @param {object} patch — поля applyPnkStagePatch
 */
export async function patchPnkClientLocal(client, patch = {}) {
  const base = normalizeClientPnkFields(client)
  const result = applyPnkStagePatch({
    client: base,
    ...patch,
    by_role: patch.by_role || 'trainer',
  })
  if (!result.ok) return result
  await saveLocalWithSync('clients', result.client, {
    table_name: 'clients',
    operation: 'update',
    remote_id: result.client.id,
  })
  return { ok: true, client: result.client }
}

/**
 * Отказ: журнал + либо полное удаление (чистый ПНК), либо снятие ПНК с сохранением ТЗ/АЗ.
 * @param {object} client
 * @param {{ lost_reason?: string }} [opts]
 */
export async function refuseAndDeletePnkClientLocal(client, opts = {}) {
  const base = normalizeClientPnkFields(client)
  if (!isOpenPnkClient(base)) {
    return { ok: false, error: 'Отказ доступен только для открытого ПНК' }
  }
  const built = buildPnkLostFunnelEvent(base, { reason: opts.lost_reason })
  if (!built.ok) return built

  await saveLocalWithSync('pnk_funnel_events', built.event, {
    table_name: 'pnk_funnel_events',
    operation: 'insert',
    remote_id: built.event.id,
  })

  const memberships = await listMemberships(base.id)
  if (!canFullyDeleteClientOnPnkRefuse(base, memberships)) {
    const now = new Date().toISOString()
    // закрыть/убрать только БЗ (короткие trial) — платные pz и tz/az не трогаем
    for (const m of memberships ?? []) {
      const hall = String(m?.hall ?? '').toLowerCase()
      const isDesk = hall === 'tz' || hall === 'az'
      if (isDesk) continue
      const paid = Number(m?.paid_amount)
      if (Number.isFinite(paid) && paid > 0) continue
      const total = Number(m?.total_trainings)
      // БЗ обычно 1–2 тренировки без цены
      if (Number.isFinite(total) && total > 0 && total <= 2) {
        await saveLocalWithSync(
          'memberships',
          { ...m, status: 'closed', end_date: String(m.end_date ?? '').slice(0, 10) },
          { table_name: 'memberships', operation: 'update', remote_id: m.id },
        )
      }
    }
    const cleared = {
      ...base,
      lifecycle: null,
      pnk_stage: null,
      pnk_lost_at: now,
      pnk_lost_reason: opts.lost_reason || 'Отказ',
      trainer_id: null,
      updated_at: now,
    }
    await saveLocalWithSync('clients', cleared, {
      table_name: 'clients',
      operation: 'update',
      remote_id: base.id,
    })
    return { ok: true, event: built.event, client_id: base.id, preserved: true }
  }

  await deleteClientAndAllData(base.id)
  return { ok: true, event: built.event, client_id: base.id }
}

/**
 * Создать клиента сразу как ПНК (тренер / соцсеть).
 * @param {object} row — уже собранная строка clients без lifecycle
 */
export function withPnkFieldsForInsert(row, source = 'trainer') {
  return normalizeClientPnkFields({
    ...row,
    ...buildNewPnkClientFields({
      trainer_id: row.trainer_id,
      pnk_source: source,
      pnk_trial_sessions: row.pnk_trial_sessions,
    }),
  })
}

/**
 * Создать ещё один абонемент БЗ (можно 2–3 и больше).
 * @param {object} client
 * @returns {Promise<{ ok: true, membership: object } | { ok: false, error: string }>}
 */
export async function addPnkTrialMembership(client) {
  const clientId = String(client?.id ?? '').trim()
  const clubId = String(client?.club_id ?? '').trim()
  if (!clientId) return { ok: false, error: 'Нет клиента' }
  if (!clubId) return { ok: false, error: 'У клиента не указан клуб' }

  const { types, error: typesError } = await ensureMembershipTypesForClub(clubId)
  const decision = resolvePnkStartTrainingAction({
    memberships: [],
    membershipTypes: types,
    todayIso: todayLocalIso(),
    forceNewBz: true,
  })
  if (decision.action !== 'create_bz') {
    return { ok: false, error: decision.error || typesError || 'Нет типа абонемента БЗ' }
  }

  const row = buildPnkTrialMembershipRow({
    id: crypto.randomUUID(),
    clientId,
    clubId,
    membershipTypeId: String(decision.type.id),
    todayIso: todayLocalIso(),
    totalTrainings: normalizePnkTrialSessions(client?.pnk_trial_sessions),
  })
  await saveLocalWithSync('memberships', row, {
    table_name: 'memberships',
    operation: 'insert',
    remote_id: null,
  })
  return { ok: true, membership: row }
}

/**
 * Подготовить старт бесплатной: при необходимости создать БЗ, вернуть путь к форме.
 * Несколько БЗ — норма; без confirm. `forceNewBz` — всегда добавить новый БЗ перед стартом.
 * @param {object} client
 * @param {{ isAdmin?: boolean, forceNewBz?: boolean }} [opts]
 * @returns {Promise<{ ok: true, path: string, createdMembership?: boolean } | { ok: false, error: string }>}
 */
export async function preparePnkTrialTraining(client, opts = {}) {
  const clientId = String(client?.id ?? '').trim()
  const clubId = String(client?.club_id ?? '').trim()
  if (!clientId) return { ok: false, error: 'Нет клиента' }
  if (!clubId) return { ok: false, error: 'У клиента не указан клуб' }

  const today = todayLocalIso()
  const memberships = await listMemberships(clientId)
  const path = buildPnkNewWorkoutPath({
    clientId,
    clubId,
    isAdmin: opts.isAdmin === true,
  })

  if (opts.forceNewBz !== true && pickUsableMembershipForDate(memberships, today)) {
    return { ok: true, path, createdMembership: false }
  }

  const { types, error: typesError } = await ensureMembershipTypesForClub(clubId)
  const decision = resolvePnkStartTrainingAction({
    memberships,
    membershipTypes: types,
    todayIso: today,
    forceNewBz: opts.forceNewBz === true,
  })
  if (decision.action === 'open') {
    return { ok: true, path, createdMembership: false }
  }
  if (decision.action === 'need_bz_type') {
    return {
      ok: false,
      error: decision.error || typesError || 'Нет типа абонемента БЗ',
    }
  }

  const row = buildPnkTrialMembershipRow({
    id: crypto.randomUUID(),
    clientId,
    clubId,
    membershipTypeId: String(decision.type.id),
    todayIso: today,
    totalTrainings: normalizePnkTrialSessions(client?.pnk_trial_sessions),
  })
  await saveLocalWithSync('memberships', row, {
    table_name: 'memberships',
    operation: 'insert',
    remote_id: null,
  })
  return { ok: true, path, createdMembership: true }
}
