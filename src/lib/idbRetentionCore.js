/**
 * Чистая логика retention (без IndexedDB) — для verify и idbRetention.js.
 */

/** Держим чуть больше окна pull (90 дней) + буфер. */
export const LOCAL_TRAININGS_RETENTION_DAYS = 120

/**
 * @param {object} t
 * @returns {string}
 */
export function trainingDateForRetention(t) {
  return String(t?.date ?? t?.created_at ?? '').slice(0, 10)
}

/**
 * @param {object} t
 * @param {string} cutoffIso — yyyy-mm-dd
 * @param {Set<string>} pendingTrainingIds
 */
export function shouldPruneTrainingRow(t, cutoffIso, pendingTrainingIds) {
  const id = String(t?.id ?? '').trim()
  if (!id) return false
  if (pendingTrainingIds?.has(id)) return false
  if (String(t?.status ?? '') === 'draft') return false
  const d = trainingDateForRetention(t)
  return Boolean(d && cutoffIso && d < cutoffIso)
}

/**
 * @param {number} days
 */
export function retentionCutoffIso(days = LOCAL_TRAININGS_RETENTION_DAYS) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - Math.max(1, days))
  return cutoff.toISOString().slice(0, 10)
}
