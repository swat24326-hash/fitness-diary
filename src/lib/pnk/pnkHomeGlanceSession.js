/**
 * Glance ПНК на главной админа/менеджера — last-good, чтобы слот не «выскакивал».
 */
import { createGlanceCache } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'admin-pnk-home',
  ttlMs: 10 * 60 * 1000,
})

export const PNK_HOME_GLANCE_TTL_MS = cache.ttlMs

function parts(clubId) {
  return [String(clubId ?? '').trim()]
}

/** @returns {{ payload: { cards: object[] }, savedAt: number } | null} */
export function readPnkHomeGlanceSession(clubId) {
  return cache.read(parts(clubId))
}

/** @returns {object[]|null} */
export function peekPnkHomeGlanceCards(clubId) {
  const payload = cache.peek(parts(clubId))
  const cards = payload?.cards
  return Array.isArray(cards) && cards.length ? cards : null
}

export function writePnkHomeGlanceSession(clubId, cards) {
  const list = Array.isArray(cards) ? cards : []
  if (!list.length) {
    cache.invalidate({ clubId })
    return
  }
  cache.write(parts(clubId), { cards: list })
}

export function clearPnkHomeGlanceSession(clubId) {
  cache.invalidate({ clubId })
}

export function isPnkHomeGlanceFresh(savedAt, ttlMs = PNK_HOME_GLANCE_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}
