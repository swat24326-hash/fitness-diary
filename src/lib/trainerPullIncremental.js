/**
 * Параметры инкрементального trainer-pull (чистая логика, без IDB/React).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function normalizeTrainingsSinceDate(raw) {
  const s = String(raw ?? '').slice(0, 10)
  return ISO_DATE.test(s) ? s : null
}

/**
 * Дата начала окна тренировок для инкрементального pull (overlap 1 день).
 * @param {{ lastPullAt?: number | string | null, fullPull?: boolean }} opts
 * @returns {string | null} null — полное окно 90 дней на API
 */
export function resolveTrainerPullTrainingsSince(opts = {}) {
  if (opts?.fullPull === true) return null
  const raw = opts?.lastPullAt
  if (raw == null || raw === '') return null
  const ms = typeof raw === 'number' ? raw : Date.parse(String(raw))
  if (!Number.isFinite(ms) || ms <= 0) return null
  const d = new Date(ms)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * @param {object} payload
 * @returns {boolean}
 */
export function shouldForceFullTrainerPull(payload) {
  return payload?.trainings_truncated === true
}
