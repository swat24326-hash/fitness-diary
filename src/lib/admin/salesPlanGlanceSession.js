/**
 * Glance плана продаж на главной админа (профиль admin-sales-plan).
 */
import { createGlanceCache } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'admin-sales-plan',
  ttlMs: 2 * 60 * 60 * 1000,
})

export const SALES_PLAN_GLANCE_TTL_MS = cache.ttlMs

function parts(clubId, reportDate) {
  return [String(clubId ?? '').trim(), String(reportDate ?? '').slice(0, 10)]
}

/** @returns {{ payload: object, savedAt: number } | null} */
export function readSalesPlanGlanceSession(clubId, reportDate) {
  return cache.read(parts(clubId, reportDate))
}

export function peekSalesPlanGlanceSession(clubId, reportDate) {
  return cache.peek(parts(clubId, reportDate))
}

export function writeSalesPlanGlanceSession(clubId, reportDate, payload) {
  cache.write(parts(clubId, reportDate), payload)
}

export function clearSalesPlanGlanceSession(clubId) {
  cache.invalidate({ clubId })
}

export function invalidateAdminSalesPlanGlance(clubId) {
  clearSalesPlanGlanceSession(clubId)
}

export function isSalesPlanGlanceFresh(savedAt, ttlMs = SALES_PLAN_GLANCE_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}

/** Тихое сравнение для SWR (без мигания одинакового факта/плана). */
export function salesPlanGlanceLooksSame(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if ((Number(a.fact) || 0) !== (Number(b.fact) || 0)) return false
  if (String(a.monthLabel ?? '') !== String(b.monthLabel ?? '')) return false
  const al = a.planLevels ?? {}
  const bl = b.planLevels ?? {}
  if ((Number(al.level1) || 0) !== (Number(bl.level1) || 0)) return false
  if ((Number(al.level2) || 0) !== (Number(bl.level2) || 0)) return false
  if ((Number(al.level3) || 0) !== (Number(bl.level3) || 0)) return false
  const ae = Number(a.forecastBundle?.expense)
  const be = Number(b.forecastBundle?.expense)
  if ((Number.isFinite(ae) ? ae : 0) !== (Number.isFinite(be) ? be : 0)) return false
  const ar = Array.isArray(a.forecastBundle?.monthRows) ? a.forecastBundle.monthRows.length : 0
  const br = Array.isArray(b.forecastBundle?.monthRows) ? b.forecastBundle.monthRows.length : 0
  return ar === br
}
