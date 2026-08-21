/**
 * Флаг «PWA-обновление в полёте» — переживает reload.
 * Auth/Login не должны мигать экраном входа, пока идёт смена SW.
 */

export const PWA_UPDATE_IN_FLIGHT_KEY = 'fit_pwa_update_in_flight_v1'
/** Дольше — считаем зависшим, снова показываем обычный login. */
export const PWA_UPDATE_IN_FLIGHT_MAX_MS = 120_000

/**
 * @param {unknown} raw
 * @returns {{ at: number } | null}
 */
export function parsePwaUpdateInFlight(raw) {
  if (raw == null || raw === '') return null
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    const at = Number(o?.at) || 0
    if (!at) return null
    return { at }
  } catch {
    return null
  }
}

/**
 * @param {{ at: number } | null} stamp
 * @param {number} [now]
 * @param {number} [maxMs]
 */
export function isPwaUpdateInFlightStamp(stamp, now = Date.now(), maxMs = PWA_UPDATE_IN_FLIGHT_MAX_MS) {
  if (!stamp?.at) return false
  return now - stamp.at < maxMs
}
