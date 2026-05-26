/** Прогресс ручной синхронизации (очередь) — для UI в шапке. */

/** @type {((payload: { done: number, total: number, percent: number, label: string }) => void) | null} */
let queueProgressReporter = null

/**
 * @param {(payload: { done: number, total: number, percent: number, label: string }) => void} [fn]
 */
export function setQueueFlushProgressReporter(fn) {
  queueProgressReporter = fn ?? null
}

export function reportQueueFlushProgress(done, total, label = 'Отправка…') {
  if (!queueProgressReporter) return
  const safeTotal = Math.max(0, Number(total) || 0)
  const safeDone = Math.min(Math.max(0, Number(done) || 0), safeTotal || 0)
  const percent = safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0
  queueProgressReporter({ done: safeDone, total: safeTotal, percent, label })
}
