/** Подсчёт клиентов по trainer_id (чистая логика для verify). */

/**
 * @param {object[]} rows
 * @returns {Record<string, number>}
 */
export function aggregateClientCountsByTrainer(rows) {
  const counts = {}
  for (const c of rows ?? []) {
    const tid = c?.trainer_id
    if (!tid) continue
    const key = String(tid)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
