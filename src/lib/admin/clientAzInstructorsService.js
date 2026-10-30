/**
 * CRUD связей инструкторов АЗ: IndexedDB + sync. Без React.
 */

import { getDb } from '../localDb.js'
import { deleteLocalWithSync, saveLocalWithSync } from '../syncService.js'
import { ensureMembershipTypesForClub } from '../membershipTypesService.js'
import { filterAerobicSalesTypes } from '../membershipTypesCore.js'
import { listTrainerSummariesForAdmin } from '../dataAccess.js'
import {
  CLIENT_AZ_INSTRUCTORS_TABLE,
  buildClientAzInstructorRow,
  filterClientAzInstructorsByClient,
  validateClientAzInstructorAssign,
} from './clientAzInstructorsCore.js'
import { mergeClientAzInstructorsIntoCache } from './clientAzInstructorsCache.js'
import { fetchMembershipsForClubViaAdminApi } from './adminApiClient.js'

/**
 * @param {string} clientId
 * @returns {Promise<object[]>}
 */
export async function listClientAzInstructorsLocal(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  const db = await getDb()
  if (!db.objectStoreNames.contains(CLIENT_AZ_INSTRUCTORS_TABLE)) return []
  try {
    if (db.objectStoreNames.contains(CLIENT_AZ_INSTRUCTORS_TABLE)) {
      const idx = db.transaction(CLIENT_AZ_INSTRUCTORS_TABLE).store.indexNames
      if ([...idx].includes('by_client_id')) {
        return await db.getAllFromIndex(CLIENT_AZ_INSTRUCTORS_TABLE, 'by_client_id', cid)
      }
    }
  } catch {
    /* fall through */
  }
  const all = await db.getAll(CLIENT_AZ_INSTRUCTORS_TABLE)
  return filterClientAzInstructorsByClient(all, cid)
}

/**
 * Подтянуть клубной кэш из list-memberships (если сервер уже отдаёт поле).
 * @param {string} clubId
 */
export async function refreshClientAzInstructorsClubCache(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return 0
  const via = await fetchMembershipsForClubViaAdminApi(cid).catch(() => null)
  const rows = via?.client_az_instructors
  if (!Array.isArray(rows) || !rows.length) return 0
  return mergeClientAzInstructorsIntoCache(rows)
}

/**
 * @param {string} clubId
 * @returns {Promise<object[]>}
 */
export async function listAzDirectionTypesForClub(clubId) {
  const res = await ensureMembershipTypesForClub(clubId, { aerobicOnly: true, activeOnly: true })
  const list = Array.isArray(res) ? res : Array.isArray(res?.types) ? res.types : []
  return filterAerobicSalesTypes(list)
}

/**
 * @param {string} clubId
 * @returns {Promise<object[]>}
 */
export async function listAzInstructorCandidatesForClub(clubId) {
  const cid = String(clubId ?? '').trim()
  const all = await listTrainerSummariesForAdmin()
  return (all ?? []).filter((t) => t?.id && String(t.club_id ?? '') === cid)
}

/**
 * @param {{
 *   client: object,
 *   instructorId: string,
 *   directionTypeId: string,
 * }} input
 */
export async function assignClientAzInstructor(input) {
  const client = input?.client
  const clientId = String(client?.id ?? '').trim()
  const clubId = String(client?.club_id ?? '').trim()
  if (!clientId || !clubId) return { ok: false, error: 'Нет клиента или клуба' }

  const existing = await listClientAzInstructorsLocal(clientId)
  const azTypes = await listAzDirectionTypesForClub(clubId)
  const azTypeIds = azTypes.map((t) => String(t.id))

  const built = buildClientAzInstructorRow({
    clientId,
    clubId,
    instructorId: input?.instructorId,
    directionTypeId: input?.directionTypeId,
  })
  if (!built.ok) return built

  const checked = validateClientAzInstructorAssign({
    client,
    row: built.data,
    existingRows: existing,
    azTypeIds,
  })
  if (!checked.ok) return checked

  await saveLocalWithSync(CLIENT_AZ_INSTRUCTORS_TABLE, checked.data, {
    table_name: CLIENT_AZ_INSTRUCTORS_TABLE,
    operation: 'insert',
    remote_id: checked.data.id,
  })
  return { ok: true, data: checked.data }
}

/**
 * @param {string} linkId
 * @param {object} [row]
 */
export async function removeClientAzInstructor(linkId, row = {}) {
  const id = String(linkId ?? '').trim()
  if (!id) return { ok: false, error: 'Нет id связи' }
  await deleteLocalWithSync(CLIENT_AZ_INSTRUCTORS_TABLE, id, CLIENT_AZ_INSTRUCTORS_TABLE, row)
  return { ok: true }
}

/**
 * Один основной инструктор на направление: снять прежних на это направление, назначить нового (или очистить).
 * @param {{
 *   client: object,
 *   instructorId: string,
 *   directionTypeId: string,
 * }} input
 */
export async function setPrimaryClientAzInstructor(input) {
  const client = input?.client
  const clientId = String(client?.id ?? '').trim()
  const directionTypeId = String(input?.directionTypeId ?? '').trim()
  const instructorId = String(input?.instructorId ?? '').trim()
  if (!clientId) return { ok: false, error: 'Нет клиента' }
  if (!directionTypeId) return { ok: false, error: 'Укажите направление АЗ в абонементе' }

  const existing = await listClientAzInstructorsLocal(clientId)
  const sameDir = existing.filter((r) => String(r?.direction_type_id ?? '') === directionTypeId)
  for (const row of sameDir) {
    if (instructorId && String(row.instructor_id) === instructorId) continue
    await removeClientAzInstructor(row.id, row)
  }
  if (!instructorId) return { ok: true, data: null }
  if (sameDir.some((r) => String(r.instructor_id) === instructorId)) {
    return { ok: true, data: sameDir.find((r) => String(r.instructor_id) === instructorId) }
  }
  return assignClientAzInstructor({ client, instructorId, directionTypeId })
}
