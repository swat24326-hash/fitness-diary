/**
 * Сколько тренировочных весов уже в истории (по training_id).
 * @param {object[]} entries
 */
export function countImportedTrainingWeights(entries) {
  const ids = new Set()
  for (const row of entries ?? []) {
    if (row?.source !== 'training' || !row?.training_id) continue
    ids.add(String(row.training_id))
  }
  return ids.size
}

/**
 * Нужна подгрузка: есть веса на тренировках, но в истории нет или не все.
 * @param {{ trainingId: string }[]} trainingPicks
 * @param {object[]} entries
 */
export function needsWeightImportRefresh(trainingPicks, entries) {
  const total = trainingPicks?.length ?? 0
  if (!total) return false
  const imported = countImportedTrainingWeights(entries)
  return imported < total
}

/**
 * Дата последней записи веса (не baseline).
 * @param {object[]} entries
 * @returns {string | null} YYYY-MM-DD
 */
export function pickLastWeightEntryDate(entries) {
  const rows = (entries ?? []).filter(
    (r) => r?.source !== 'baseline' && r?.source !== 'initial_adjust' && r?.date,
  )
  if (!rows.length) return null
  const sorted = [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return String(sorted[0].date).slice(0, 10)
}
