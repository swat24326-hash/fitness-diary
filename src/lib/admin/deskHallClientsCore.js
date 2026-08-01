/**
 * Вкладки списка клиентов: обычные / desk ТЗ / desk АЗ.
 */

/** @typedef {'active'|'tz'|'az'|'archive'} AdminClientsListTab */

export const ADMIN_CLIENTS_LIST_TABS = ['active', 'tz', 'az', 'archive']

/**
 * @param {unknown} raw
 * @returns {'tz'|'az'|null}
 */
export function normalizeDeskHall(raw) {
  const h = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (h === 'tz' || h === 'тз') return 'tz'
  if (h === 'az' || h === 'аз') return 'az'
  return null
}

/**
 * @param {object|null|undefined} client
 */
export function clientDeskHall(client) {
  return normalizeDeskHall(client?.desk_hall)
}

/**
 * @param {unknown} tab
 * @returns {AdminClientsListTab}
 */
export function normalizeAdminClientsListTab(tab) {
  const t = String(tab ?? '').trim()
  if (t === 'tz' || t === 'az' || t === 'archive') return t
  return 'active'
}

/**
 * @param {object|null|undefined} client
 * @param {AdminClientsListTab} tab
 */
export function clientMatchesAdminListTab(client, tab) {
  const t = normalizeAdminClientsListTab(tab)
  const archived = Boolean(client?.archived_at)
  if (t === 'archive') return archived
  if (archived) return false
  const hall = clientDeskHall(client)
  if (t === 'tz') return hall === 'tz'
  if (t === 'az') return hall === 'az'
  // active = обычные клиенты (не desk ТЗ/АЗ)
  return hall == null
}

/**
 * @param {object[]|null|undefined} clients
 * @param {AdminClientsListTab} tab
 */
export function filterClientsByAdminListTab(clients, tab) {
  return (clients ?? []).filter((c) => clientMatchesAdminListTab(c, tab))
}

/**
 * @param {object[]|null|undefined} clients
 */
export function countClientsByAdminListTab(clients) {
  const list = clients ?? []
  return {
    active: filterClientsByAdminListTab(list, 'active').length,
    tz: filterClientsByAdminListTab(list, 'tz').length,
    az: filterClientsByAdminListTab(list, 'az').length,
    archive: filterClientsByAdminListTab(list, 'archive').length,
  }
}
