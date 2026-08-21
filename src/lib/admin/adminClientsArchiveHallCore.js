/**
 * Подвкладки Архива: Все / ПЗ / ТЗ / АЗ — та же классификация, что у живых вкладок
 * (memberships + desk_hall), не только desk_hall.
 */

import { clientMembershipHallSet } from '../membershipHallCore.js'
import { clientDeskHall, filterClientsByAdminListTab } from './deskHallClientsCore.js'

/** @typedef {''|'pz'|'tz'|'az'} ArchiveHallFilter */

export const ARCHIVE_HALL_FILTER_ALL = ''
export const ARCHIVE_HALL_FILTER_PZ = 'pz'
export const ARCHIVE_HALL_FILTER_TZ = 'tz'
export const ARCHIVE_HALL_FILTER_AZ = 'az'

export const ARCHIVE_HALL_FILTER_LABELS = Object.freeze({
  [ARCHIVE_HALL_FILTER_ALL]: 'Все',
  [ARCHIVE_HALL_FILTER_PZ]: 'ПЗ',
  [ARCHIVE_HALL_FILTER_TZ]: 'ТЗ',
  [ARCHIVE_HALL_FILTER_AZ]: 'АЗ',
})

/**
 * @param {unknown} raw
 * @returns {ArchiveHallFilter}
 */
export function normalizeArchiveHallFilter(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (!s || s === 'all' || s === '*' || s === 'все') return ARCHIVE_HALL_FILTER_ALL
  if (s === 'pz' || s === 'пз' || s === 'active') return ARCHIVE_HALL_FILTER_PZ
  if (s === 'tz' || s === 'тз') return ARCHIVE_HALL_FILTER_TZ
  if (s === 'az' || s === 'аз') return ARCHIVE_HALL_FILTER_AZ
  return ARCHIVE_HALL_FILTER_ALL
}

/**
 * Primary-зал архивного клиента: явный desk_hall, иначе абоны (ТЗ → АЗ → ПЗ).
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} [memberships]
 * @returns {'pz'|'tz'|'az'}
 */
export function archiveClientHall(client, memberships) {
  const desk = clientDeskHall(client)
  if (desk === 'tz' || desk === 'az') return desk
  const halls = clientMembershipHallSet(client, memberships)
  if (halls.has('tz')) return 'tz'
  if (halls.has('az')) return 'az'
  return ARCHIVE_HALL_FILTER_PZ
}

/** @param {Record<string, object[]>|null|undefined} byId @param {object|null|undefined} client */
function membershipsForClient(byId, client) {
  const id = String(client?.id ?? '').trim()
  if (!id || !byId) return []
  const list = byId[id]
  return Array.isArray(list) ? list : []
}

/**
 * @param {object|null|undefined} client — уже архивный
 * @param {unknown} filterRaw
 * @param {object[]|null|undefined} [memberships]
 */
export function clientMatchesArchiveHallFilter(client, filterRaw, memberships) {
  const want = normalizeArchiveHallFilter(filterRaw)
  if (!want) return true
  return archiveClientHall(client, memberships) === want
}

/**
 * @param {object[]|null|undefined} clients — любой набор; берутся только archived
 * @param {unknown} filterRaw
 * @param {Record<string, object[]>|null|undefined} [membershipsByClientId]
 */
export function filterArchivedClientsByHall(clients, filterRaw, membershipsByClientId) {
  const archived = filterClientsByAdminListTab(clients, 'archive')
  const want = normalizeArchiveHallFilter(filterRaw)
  if (!want) return archived
  return archived.filter((c) =>
    clientMatchesArchiveHallFilter(c, want, membershipsForClient(membershipsByClientId, c)),
  )
}

/**
 * @param {object[]|null|undefined} clients
 * @param {Record<string, object[]>|null|undefined} [membershipsByClientId]
 * @returns {{ all: number, pz: number, tz: number, az: number }}
 */
export function countArchivedClientsByHall(clients, membershipsByClientId) {
  const archived = filterClientsByAdminListTab(clients, 'archive')
  let pz = 0
  let tz = 0
  let az = 0
  for (const c of archived) {
    const h = archiveClientHall(c, membershipsForClient(membershipsByClientId, c))
    if (h === 'tz') tz += 1
    else if (h === 'az') az += 1
    else pz += 1
  }
  return { all: archived.length, pz, tz, az }
}

/**
 * Чипы: Все + ПЗ/ТЗ/АЗ (всегда, даже с нулём — видно пустые залы).
 * @param {object[]|null|undefined} clients
 * @param {Record<string, object[]>|null|undefined} [membershipsByClientId]
 * @returns {Array<{ id: ArchiveHallFilter, label: string, count: number }>}
 */
export function buildArchiveHallFilterOptions(clients, membershipsByClientId) {
  const counts = countArchivedClientsByHall(clients, membershipsByClientId)
  return [
    { id: ARCHIVE_HALL_FILTER_ALL, label: ARCHIVE_HALL_FILTER_LABELS[ARCHIVE_HALL_FILTER_ALL], count: counts.all },
    { id: ARCHIVE_HALL_FILTER_PZ, label: ARCHIVE_HALL_FILTER_LABELS[ARCHIVE_HALL_FILTER_PZ], count: counts.pz },
    { id: ARCHIVE_HALL_FILTER_TZ, label: ARCHIVE_HALL_FILTER_LABELS[ARCHIVE_HALL_FILTER_TZ], count: counts.tz },
    { id: ARCHIVE_HALL_FILTER_AZ, label: ARCHIVE_HALL_FILTER_LABELS[ARCHIVE_HALL_FILTER_AZ], count: counts.az },
  ]
}
