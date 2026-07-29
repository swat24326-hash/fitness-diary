/**
 * Glance планёрки на главной — last-good, без выскакивания после fetch.
 */
import { createGlanceCache } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'admin-planerka-home',
  ttlMs: 10 * 60 * 1000,
})

export const PLANERKA_HOME_GLANCE_TTL_MS = cache.ttlMs

function parts(clubId) {
  return [String(clubId ?? '').trim()]
}

export function readPlanerkaHomeGlanceSession(clubId) {
  return cache.read(parts(clubId))
}

/** @returns {object[]|null} */
export function peekPlanerkaHomeGlanceTasks(clubId) {
  const payload = cache.peek(parts(clubId))
  const tasks = payload?.tasks
  return Array.isArray(tasks) && tasks.length ? tasks : null
}

export function writePlanerkaHomeGlanceSession(clubId, tasks) {
  const list = Array.isArray(tasks) ? tasks : []
  if (!list.length) {
    cache.invalidate({ clubId })
    return
  }
  cache.write(parts(clubId), { tasks: list })
}

export function clearPlanerkaHomeGlanceSession(clubId) {
  cache.invalidate({ clubId })
}

export function isPlanerkaHomeGlanceFresh(savedAt, ttlMs = PLANERKA_HOME_GLANCE_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}
