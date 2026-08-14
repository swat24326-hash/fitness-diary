/**
 * Session last-good для glance «кому звонить» на главной.
 */
import { createGlanceCache } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'sales-call-today',
  ttlMs: 5 * 60 * 1000,
})

export const CALL_TODAY_HOME_GLANCE_TTL_MS = cache.ttlMs
export const CALL_TODAY_HOME_GLANCE_CHANGED_EVENT = 'fitcity:call-today-home-glance-changed'
export const CALL_TODAY_HOME_REVALIDATE_MIN_MS = 45_000

function parts(clubId) {
  return [String(clubId ?? '').trim()]
}

/** @returns {{ payload: { items: object[], total: number }, savedAt: number } | null} */
export function readCallTodayHomeGlanceSession(clubId) {
  return cache.read(parts(clubId))
}

/** @returns {{ items: object[], total: number } | null} */
export function peekCallTodayHomeGlance(clubId) {
  const payload = cache.peek(parts(clubId))
  if (!payload || !Array.isArray(payload.items)) return null
  return { items: payload.items, total: Math.max(0, Number(payload.total) || 0) }
}

/**
 * @param {string} clubId
 * @param {{ items: object[], total: number }} glance
 */
export function writeCallTodayHomeGlanceSession(clubId, glance) {
  const items = Array.isArray(glance?.items) ? glance.items : []
  const total = Math.max(0, Number(glance?.total) || items.length)
  cache.write(parts(clubId), { items, total })
}

export function clearCallTodayHomeGlanceSession(clubId) {
  cache.invalidate({ clubId })
}

/**
 * @param {{ savedAt?: number, hasCached?: boolean, force?: boolean }} opts
 */
export function shouldNetworkRevalidateCallTodayHomeGlance(opts = {}) {
  if (opts.force) return true
  const savedAt = Number(opts.savedAt) || 0
  if (!opts.hasCached || !savedAt) return true
  return Date.now() - savedAt >= CALL_TODAY_HOME_REVALIDATE_MIN_MS
}

/** @param {string} clubId */
export function notifyCallTodayHomeGlanceChanged(clubId, detail = {}) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent(CALL_TODAY_HOME_GLANCE_CHANGED_EVENT, {
        detail: { clubId: String(clubId ?? '').trim(), ...detail },
      }),
    )
  } catch {
    /* ignore */
  }
}
