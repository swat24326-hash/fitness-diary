/**
 * Glance сводки смены call-центра на главной /club (и /admin).
 */
import { createGlanceCache, glancePayloadLooksSame } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'club-call-shift',
  ttlMs: 5 * 60 * 1000,
})

export const CLUB_CALL_SHIFT_GLANCE_TTL_MS = cache.ttlMs

function parts(clubId, dayIso) {
  return [String(clubId ?? '').trim(), String(dayIso ?? '').slice(0, 10)]
}

export function readClubCallShiftGlanceSession(clubId, dayIso) {
  return cache.read(parts(clubId, dayIso))
}

export function peekClubCallShiftGlanceSession(clubId, dayIso) {
  return cache.peek(parts(clubId, dayIso))
}

export function writeClubCallShiftGlanceSession(clubId, dayIso, summary) {
  cache.write(parts(clubId, dayIso), summary)
}

export function clearClubCallShiftGlanceSession(clubId) {
  cache.invalidate({ clubId })
}

export function isClubCallShiftGlanceFresh(savedAt, ttlMs = CLUB_CALL_SHIFT_GLANCE_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}

export function clubCallShiftGlanceLooksSame(a, b) {
  return glancePayloadLooksSame(a, b, [
    'day',
    'calls',
    'answered',
    'missed',
    'pending',
    'sms',
    'sms_fail',
    'callback_open',
    'followup_clients',
    'closed_clients',
    'open_notes',
    'close_notes',
    'refused',
    'bought',
    'other_close',
    'has_activity',
    'is_hot',
  ])
}
