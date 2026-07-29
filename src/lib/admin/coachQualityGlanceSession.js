/**
 * Glance «Качество ведения» на главной админа (профиль admin-cq).
 * Обёртка над homeGlanceCache — detail-статистика этот TTL не использует.
 */
import { createGlanceCache, glancePayloadLooksSame } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'admin-cq',
  ttlMs: 60 * 60 * 1000,
})

export const COACH_QUALITY_GLANCE_TTL_MS = cache.ttlMs

function parts(clubId, dateFrom, dateTo) {
  return [
    String(clubId ?? '').trim(),
    String(dateFrom ?? '').slice(0, 10),
    String(dateTo ?? '').slice(0, 10),
  ]
}

/** @returns {{ glance: object, savedAt: number } | null} */
export function readCoachQualityGlanceSession(clubId, dateFrom, dateTo) {
  const row = cache.read(parts(clubId, dateFrom, dateTo))
  if (!row) return null
  return { glance: row.payload, savedAt: row.savedAt }
}

export function peekCoachQualityGlanceSession(clubId, dateFrom, dateTo) {
  return cache.peek(parts(clubId, dateFrom, dateTo))
}

export function coachQualityGlanceLooksSame(a, b) {
  return glancePayloadLooksSame(a, b, [
    'scorePct',
    'chipLabel',
    'hot',
    'reviewCount',
    'attentionCount',
    'droppedCount',
  ])
}

export function writeCoachQualityGlanceSession(clubId, dateFrom, dateTo, glance) {
  cache.write(parts(clubId, dateFrom, dateTo), glance)
}

export function clearCoachQualityGlanceSession(clubId) {
  cache.invalidate({ clubId })
}

/** Alias: Sync / смена клуба / настройки CQ. */
export function invalidateAdminCoachQualityGlance(clubId) {
  clearCoachQualityGlanceSession(clubId)
}

export function isCoachQualityGlanceFresh(savedAt, ttlMs = COACH_QUALITY_GLANCE_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}
