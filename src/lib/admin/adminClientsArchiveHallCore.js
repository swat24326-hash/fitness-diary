/**
 * Подвкладки Архива: Все / ПЗ / ТЗ / АЗ — та же классификация, что у живых вкладок.
 * Чистая логика без React / IDB.
 */

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
 * Зал архивного клиента: desk → tz/az, иначе ПЗ.
 * @param {object|null|undefined} client
 * @returns {'pz'|'tz'|'az'}
 */
export function archiveClientHall(client) {
  const hall = clientDeskHall(client)
  if (hall === 'tz' || hall === 'az') return hall
  return ARCHIVE_HALL_FILTER_PZ
}

/**
 * @param {object|null|undefined} client — уже архивный
 * @param {unknown} filterRaw
 */
export function clientMatchesArchiveHallFilter(client, filterRaw) {
  const want = normalizeArchiveHallFilter(filterRaw)
  if (!want) return true
  return archiveClientHall(client) === want
}

/**
 * @param {object[]|null|undefined} clients — любой набор; берутся только archived
 * @param {unknown} filterRaw
 */
export function filterArchivedClientsByHall(clients, filterRaw) {
  const archived = filterClientsByAdminListTab(clients, 'archive')
  const want = normalizeArchiveHallFilter(filterRaw)
  if (!want) return archived
  return archived.filter((c) => clientMatchesArchiveHallFilter(c, want))
}

/**
 * @param {object[]|null|undefined} clients
 * @returns {{ all: number, pz: number, tz: number, az: number }}
 */
export function countArchivedClientsByHall(clients) {
  const archived = filterClientsByAdminListTab(clients, 'archive')
  let pz = 0
  let tz = 0
  let az = 0
  for (const c of archived) {
    const h = archiveClientHall(c)
    if (h === 'tz') tz += 1
    else if (h === 'az') az += 1
    else pz += 1
  }
  return { all: archived.length, pz, tz, az }
}

/**
 * Чипы: Все + ПЗ/ТЗ/АЗ (всегда, даже с нулём — видно пустые залы).
 * @param {object[]|null|undefined} clients
 * @returns {Array<{ id: ArchiveHallFilter, label: string, count: number }>}
 */
export function buildArchiveHallFilterOptions(clients) {
  const counts = countArchivedClientsByHall(clients)
  return [
    { id: ARCHIVE_HALL_FILTER_ALL, label: ARCHIVE_HALL_FILTER_LABELS[ARCHIVE_HALL_FILTER_ALL], count: counts.all },
    { id: ARCHIVE_HALL_FILTER_PZ, label: ARCHIVE_HALL_FILTER_LABELS[ARCHIVE_HALL_FILTER_PZ], count: counts.pz },
    { id: ARCHIVE_HALL_FILTER_TZ, label: ARCHIVE_HALL_FILTER_LABELS[ARCHIVE_HALL_FILTER_TZ], count: counts.tz },
    { id: ARCHIVE_HALL_FILTER_AZ, label: ARCHIVE_HALL_FILTER_LABELS[ARCHIVE_HALL_FILTER_AZ], count: counts.az },
  ]
}
