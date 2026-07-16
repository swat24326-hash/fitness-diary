import { listMemberships } from '../dataAccess.js'
import { todayLocalIso } from '../dateRu.js'
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
 * Подготовить старт бесплатной: при необходимости создать абонемент БЗ, вернуть путь к форме.
 * Если БЗ уже был и израсходован — без `allowCreateAfterDepleted` вернёт `needsConfirm`.
 * @param {object} client
 * @param {{ isAdmin?: boolean, allowCreateAfterDepleted?: boolean }} [opts]
 * @returns {Promise<
 *   | { ok: true, path: string, createdMembership?: boolean }
 *   | { ok: false, error: string, needsConfirm?: boolean }
 * >}
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

  const first = resolvePnkStartTrainingAction({
    memberships,
    membershipTypes: [],
    todayIso: today,
    allowCreateAfterDepleted: opts.allowCreateAfterDepleted === true,
  })
  if (first.action === 'open') {
    return { ok: true, path, createdMembership: false }
  }

  const { types, error: typesError } = await ensureMembershipTypesForClub(clubId)
  const decision = resolvePnkStartTrainingAction({
    memberships,
    membershipTypes: types,
    todayIso: today,
    allowCreateAfterDepleted: opts.allowCreateAfterDepleted === true,
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
  if (decision.action === 'confirm_new_bz') {
    return {
      ok: false,
      needsConfirm: true,
      error:
        'У клиента уже был абонемент БЗ (занятие использовано или срок прошёл). Создать новый БЗ на 1 занятие?',
    }
  }

  const row = buildPnkTrialMembershipRow({
    id: crypto.randomUUID(),
    clientId,
    clubId,
    membershipTypeId: String(decision.type.id),
    todayIso: today,
    trialDateIso: client?.pnk_trial_date,
  })
  await saveLocalWithSync('memberships', row, {
    table_name: 'memberships',
    operation: 'insert',
    remote_id: null,
  })
  return { ok: true, path, createdMembership: true }
}
