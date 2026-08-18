/**
 * Журнал списаний: роли, строки, поиск. Без React / fetch.
 */

/**
 * Журнал — sales_manager и admin. Не тренер, не управляющий.
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isTrainer?: boolean, isSupervisor?: boolean }} role
 */
export function canOpenLoyaltyJournal(role = {}) {
  if (role.isAdmin === true) return true
  if (role.isSalesManager === true) return true
  return false
}

/**
 * @param {object} row
 * @param {Record<string, string>} [nameById]
 */
export function formatLoyaltyJournalRow(row, nameById = {}) {
  const id = String(row?.id ?? '').trim()
  const clientId = String(row?.client_id ?? '').trim()
  const fromMap = clientId ? String(nameById[clientId] ?? '').trim() : ''
  const fromRow = String(row?.client_name ?? '').trim()
  const points = Number(row?.points)
  return {
    id,
    client_id: clientId,
    client_name: fromMap || fromRow || 'Клиент',
    at: String(row?.at ?? row?.created_at ?? ''),
    points: Number.isFinite(points) ? Math.round(points) : 0,
    comment: String(row?.comment ?? '').trim(),
  }
}

/**
 * @param {object[]} rows
 * @param {string} q
 */
export function filterLoyaltyJournalRows(rows, q) {
  const needle = String(q ?? '').trim().toLowerCase()
  const list = Array.isArray(rows) ? rows : []
  if (!needle) return list
  return list.filter((r) => {
    const name = String(r?.client_name ?? '').toLowerCase()
    const comment = String(r?.comment ?? '').toLowerCase()
    return name.includes(needle) || comment.includes(needle)
  })
}
