/** Суперсет: 2–3 соседних упражнения с общей меткой, порядок подходов не меняется. */

const SUPERSET_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const SUPERSET_MAX_SIZE = 3

export function normalizeSupersetGroup(v) {
  const s = String(v ?? '').trim().toUpperCase()
  return s.length === 1 && SUPERSET_LETTERS.includes(s) ? s : null
}

export function nextSupersetGroup(exercises) {
  const used = new Set()
  for (const ex of exercises ?? []) {
    const g = normalizeSupersetGroup(ex?.superset_group)
    if (g) used.add(g)
  }
  for (const ch of SUPERSET_LETTERS) {
    if (!used.has(ch)) return ch
  }
  return 'A'
}

export function sharesSupersetGroup(a, b) {
  const ga = normalizeSupersetGroup(a?.superset_group)
  const gb = normalizeSupersetGroup(b?.superset_group)
  return Boolean(ga && gb && ga === gb)
}

/** @returns {{ start: number, end: number, group: string, size: number } | null} */
export function supersetChainBounds(exercises, idx) {
  const list = exercises ?? []
  const g = normalizeSupersetGroup(list[idx]?.superset_group)
  if (!g) return null
  let start = idx
  while (start > 0 && normalizeSupersetGroup(list[start - 1]?.superset_group) === g) start--
  let end = idx
  while (end < list.length - 1 && normalizeSupersetGroup(list[end + 1]?.superset_group) === g) end++
  return { start, end, group: g, size: end - start + 1 }
}

/** Убирает «висячие» метки без соседа с той же группой. */
export function cleanupSupersetGroups(exercises) {
  const list = (exercises ?? []).map((ex) => ({ ...ex }))
  for (let i = 0; i < list.length; i++) {
    const g = normalizeSupersetGroup(list[i]?.superset_group)
    if (!g) continue
    const prevSame = i > 0 && normalizeSupersetGroup(list[i - 1]?.superset_group) === g
    const nextSame = i < list.length - 1 && normalizeSupersetGroup(list[i + 1]?.superset_group) === g
    if (!prevSame && !nextSame) list[i] = { ...list[i], superset_group: null }
  }
  return list
}

export function isJoinedWithPrevious(exercises, idx) {
  if (idx <= 0) return false
  return sharesSupersetGroup(exercises[idx], exercises[idx - 1])
}

/**
 * Сосед с предыдущим: вкл/выкл суперсет (макс. 3 подряд).
 * @param {object[]} exercises
 * @param {number} idx
 */
export function toggleSupersetWithPrevious(exercises, idx) {
  if (idx <= 0) return exercises
  let list = (exercises ?? []).map((ex) => ({ ...ex }))
  const cur = list[idx]
  const prev = list[idx - 1]

  if (isJoinedWithPrevious(list, idx)) {
    list[idx] = { ...cur, superset_group: null }
    return cleanupSupersetGroups(list)
  }

  const prevG = normalizeSupersetGroup(prev.superset_group)
  const bounds = prevG ? supersetChainBounds(list, idx - 1) : null
  const chainSize = bounds?.size ?? 1
  if (chainSize >= SUPERSET_MAX_SIZE) return exercises

  const g = prevG ?? nextSupersetGroup(list)
  list[idx - 1] = { ...prev, superset_group: g }
  list[idx] = { ...cur, superset_group: g }
  return list
}

/** @returns {'start' | 'mid' | 'end' | null} */
export function supersetRailRole(exercises, idx) {
  const bounds = supersetChainBounds(exercises, idx)
  if (!bounds || bounds.size < 2) return null
  if (idx === bounds.start) return 'start'
  if (idx === bounds.end) return 'end'
  return 'mid'
}

/** Для просмотра дневника: блоки «суперсет» и одиночные упражнения. */
export function groupExercisesForDisplay(exercises) {
  const list = exercises ?? []
  const out = []
  let i = 0
  while (i < list.length) {
    const bounds = supersetChainBounds(list, i)
    if (bounds && bounds.size >= 2) {
      out.push({
        kind: 'superset',
        group: bounds.group,
        items: list.slice(bounds.start, bounds.end + 1),
      })
      i = bounds.end + 1
      continue
    }
    out.push({ kind: 'single', items: [list[i]] })
    i++
  }
  return out
}
