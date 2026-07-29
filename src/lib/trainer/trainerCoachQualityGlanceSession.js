/**
 * Glance «Качество ведения» на главной тренера (профиль trainer-cq).
 */
import { createGlanceCache, glancePayloadLooksSame } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'trainer-cq',
  ttlMs: 45 * 60 * 1000,
})

export const TRAINER_CQ_GLANCE_TTL_MS = cache.ttlMs

function parts(trainerId, dateFrom, dateTo) {
  return [
    String(trainerId ?? '').trim(),
    String(dateFrom ?? '').slice(0, 10),
    String(dateTo ?? '').slice(0, 10),
  ]
}

export function readTrainerCoachQualityGlanceSession(trainerId, dateFrom, dateTo) {
  return cache.read(parts(trainerId, dateFrom, dateTo))
}

export function peekTrainerCoachQualityGlanceSession(trainerId, dateFrom, dateTo) {
  return cache.peek(parts(trainerId, dateFrom, dateTo))
}

export function writeTrainerCoachQualityGlanceSession(trainerId, dateFrom, dateTo, glance) {
  cache.write(parts(trainerId, dateFrom, dateTo), glance)
}

export function clearTrainerCoachQualityGlanceSession(trainerId) {
  cache.invalidate({ clubId: trainerId })
}

export function invalidateTrainerCoachQualityGlance(trainerId) {
  clearTrainerCoachQualityGlanceSession(trainerId)
}

export function isTrainerCoachQualityGlanceFresh(savedAt, ttlMs = TRAINER_CQ_GLANCE_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}

export function trainerCoachQualityGlanceLooksSame(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if (Boolean(a.hasSignal) !== Boolean(b.hasSignal)) return false
  if (String(a.headline ?? '') !== String(b.headline ?? '')) return false
  const ap = Array.isArray(a.factsPreview) ? a.factsPreview : []
  const bp = Array.isArray(b.factsPreview) ? b.factsPreview : []
  if (ap.length !== bp.length) return false
  for (let i = 0; i < ap.length; i++) {
    if (!glancePayloadLooksSame(ap[i], bp[i], ['clientId', 'clientName', 'kind'])) return false
  }
  return true
}
