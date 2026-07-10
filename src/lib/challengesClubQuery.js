/**
 * Чистая логика выборки челленджей по клубам (без IndexedDB).
 */

/** @param {object[]} rows */
export function sortChallengesByCreatedDesc(rows) {
  return [...(rows ?? [])].sort((a, b) =>
    String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? '')),
  )
}

/**
 * @param {object[]} rows
 * @param {string[]} clubIds
 */
export function filterChallengesByClubIds(rows, clubIds) {
  const idSet = new Set((clubIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
  if (!idSet.size) return []
  return (rows ?? []).filter((c) => idSet.has(String(c?.club_id ?? '')))
}

/**
 * Объединить челленджи нескольких клубов без дублей по id.
 * @param {object[][]} lists
 */
export function mergeChallengeLists(lists) {
  const byId = new Map()
  for (const list of lists ?? []) {
    for (const ch of list ?? []) {
      const id = String(ch?.id ?? '').trim()
      if (!id) continue
      if (!byId.has(id)) byId.set(id, ch)
    }
  }
  return sortChallengesByCreatedDesc([...byId.values()])
}
