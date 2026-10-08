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
    source: row?.source === 'survey' ? 'survey' : 'pz',
  }
}

export const LOYALTY_JOURNAL_SOURCE_LABELS = Object.freeze({ pz: 'Копилка ПЗ', survey: 'За опросы' })

/**
 * Одна лента журнала: списания копилки ПЗ (loyalty_ledger) и баллов за опросы (inbox_points_redemptions), новые сверху.
 * @param {object[]} pzRows строки loyalty_ledger (kind=redeem)
 * @param {object[]} surveyRows строки inbox_points_redemptions
 */
export function mergeLoyaltyJournalSources(pzRows, surveyRows, limit = 200) {
  const survey = (surveyRows ?? []).map((r) => ({
    id: r.id,
    club_id: r.club_id,
    client_id: r.client_id,
    at: r.created_at,
    points: r.points,
    comment: r.comment,
    actor_id: r.actor_id,
    source: 'survey',
  }))
  return [...(pzRows ?? []).map((r) => ({ ...r, source: 'pz' })), ...survey]
    .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
    .slice(0, limit)
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
