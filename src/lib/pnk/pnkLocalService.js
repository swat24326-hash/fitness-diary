import { listMemberships } from '../dataAccess.js'
import { todayLocalIso } from '../dateRu.js'
import { pickUsableMembershipForDate } from '../membershipRules.js'
import { ensureMembershipTypesForClub } from '../membershipTypesService.js'
import { saveLocalWithSync } from '../syncService.js'
import { applyPnkStagePatch, buildNewPnkClientFields } from './pnkStagesCore.js'
import { normalizeClientPnkFields } from './pnkClientFields.js'
import {
  buildPnkNewWorkoutPath,
  buildPnkTrialMembershipRow,
  resolvePnkStartTrainingAction,
} from './pnkTrialTrainingCore.js'

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
 * Создать клиента сразу как ПНК (тренер / соцсеть).
 * @param {object} row — уже собранная строка clients без lifecycle
 */
export function withPnkFieldsForInsert(row, source = 'trainer') {
  return normalizeClientPnkFields({
    ...row,
    ...buildNewPnkClientFields({
      trainer_id: row.trainer_id,
      pnk_source: source,
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
  })
  await saveLocalWithSync('memberships', row, {
    table_name: 'memberships',
    operation: 'insert',
    remote_id: null,
  })
  return { ok: true, path, createdMembership: true }
}
