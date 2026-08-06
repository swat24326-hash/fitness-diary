/**
 * Фильтр персонала (тренеры / менеджеры / управляющие) по клубу из шапки (?club=).
 * Без React / IndexedDB.
 */

/**
 * @param {string | null | undefined} clubIdFromUrl
 * @returns {string} trim; пустая строка = фильтр выключен (вся сеть)
 */
export function normalizeClubFilterId(clubIdFromUrl) {
  return String(clubIdFromUrl ?? '').trim()
}

/**
 * Показывать ли блок «Без клуба» / unassigned.
 * При выбранном клубе — нет (не путать с персоналом зала).
 * @param {string | null | undefined} clubIdFromUrl
 */
export function shouldShowUnassignedStaff(clubIdFromUrl) {
  return !normalizeClubFilterId(clubIdFromUrl)
}

/**
 * @template {{ club_id?: string | null }} T
 * @param {T[]} rows
 * @param {string | null | undefined} clubIdFromUrl
 * @returns {T[]}
 */
export function filterStaffByClub(rows, clubIdFromUrl) {
  const clubId = normalizeClubFilterId(clubIdFromUrl)
  const list = Array.isArray(rows) ? rows : []
  if (!clubId) return list
  return list.filter((row) => String(row?.club_id ?? '').trim() === clubId)
}

/**
 * Клубы для секций UI: при фильтре — только выбранный (если есть в списке).
 * @template {{ id?: string }} C
 * @param {C[]} clubs
 * @param {string | null | undefined} clubIdFromUrl
 * @returns {C[]}
 */
export function clubsForStaffSections(clubs, clubIdFromUrl) {
  const clubId = normalizeClubFilterId(clubIdFromUrl)
  const list = Array.isArray(clubs) ? clubs : []
  if (!clubId) return list
  return list.filter((c) => String(c?.id ?? '').trim() === clubId)
}
