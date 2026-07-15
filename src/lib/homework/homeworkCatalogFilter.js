/**
 * Фильтр каталога упражнений для конструктора ДЗ (только справочник приложения).
 */

/** @param {string} [name] */
export function normHomeworkExerciseName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * @param {Array<{ id?: string, name?: string, muscle_group?: string, primary_muscles?: string }>} catalog
 * @param {string} [query]
 * @param {string} [filterGroup]
 */
export function filterHomeworkExerciseCatalog(catalog, query = '', filterGroup = '') {
  const q = normHomeworkExerciseName(query)
  let list = [...(catalog ?? [])].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'),
  )
  if (filterGroup) {
    list = list.filter((row) => (row.muscle_group ?? '') === filterGroup)
  }
  if (!q) return list
  return list.filter((row) => {
    const hay = `${row.name ?? ''} ${row.muscle_group ?? ''} ${row.primary_muscles ?? ''}`.toLowerCase()
    return hay.includes(q)
  })
}

/**
 * @param {Array<{ id?: string, name?: string, muscle_group?: string }>} catalog
 * @returns {string[]}
 */
export function listHomeworkMuscleGroups(catalog) {
  const set = new Set()
  for (const row of catalog ?? []) {
    const g = String(row.muscle_group ?? '').trim()
    if (g) set.add(g)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
}

/**
 * @param {Array<{ id?: string, name?: string }>} catalog
 * @param {string} typedName
 */
export function resolveHomeworkCatalogExercise(catalog, typedName) {
  const cand = normHomeworkExerciseName(typedName)
  if (!cand) return null
  return (catalog ?? []).find((r) => normHomeworkExerciseName(r.name) === cand) ?? null
}
