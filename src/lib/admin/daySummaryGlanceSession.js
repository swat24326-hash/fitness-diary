/**
 * Glance сводки дня на главной админа (профиль admin-day-summary).
 */
import { createGlanceCache, glancePayloadLooksSame } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'admin-day-summary',
  ttlMs: 10 * 60 * 1000,
})

export const DAY_SUMMARY_GLANCE_TTL_MS = cache.ttlMs

function parts(clubId, todayIso) {
  return [String(clubId ?? '').trim(), String(todayIso ?? '').slice(0, 10)]
}

export function readDaySummaryGlanceSession(clubId, todayIso) {
  return cache.read(parts(clubId, todayIso))
}

export function peekDaySummaryGlanceSession(clubId, todayIso) {
  return cache.peek(parts(clubId, todayIso))
}

export function writeDaySummaryGlanceSession(clubId, todayIso, summary) {
  cache.write(parts(clubId, todayIso), summary)
}

export function clearDaySummaryGlanceSession(clubId) {
  cache.invalidate({ clubId })
}

export function invalidateAdminDaySummaryGlance(clubId) {
  clearDaySummaryGlanceSession(clubId)
}

export function isDaySummaryGlanceFresh(savedAt, ttlMs = DAY_SUMMARY_GLANCE_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}

/** Сравнение для тихого setState (без мигания одинаковых цифр). */
export function daySummaryGlanceLooksSame(a, b) {
  return glancePayloadLooksSame(a, b, [
    'today',
    'yesterday',
    'inactive',
    'expiring',
    'expired_recent',
    'stale',
    'birthdays',
    'awaiting_start',
    'trainingsToday',
    'trainingsYesterday',
    'salesReportFilled',
  ])
}
