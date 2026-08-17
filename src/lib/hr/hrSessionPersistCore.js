/** Снимок пульса в дневник при завершении — без React / BLE. */

import { normalizeHrSessionSnapshot } from './hrSessionAgg.js'

export function hrScopeAllowsRecording(trainingId) {
  return String(trainingId ?? '').trim() !== ''
}

/**
 * Первый complete — живая сводка (свежее, чем state).
 * Повторное сохранение завершённой — только уже записанный снимок, живой буфер не подмешиваем.
 */
export function pickHrSessionForPersist({ firstCompletion, liveSummary, storedSnapshot }) {
  const live = normalizeHrSessionSnapshot(liveSummary)
  const stored = normalizeHrSessionSnapshot(storedSnapshot)
  if (firstCompletion) return live || stored || null
  return stored || null
}
