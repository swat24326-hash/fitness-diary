/**
 * Session-кэш sales profile=shell (месяц / план / расход).
 * Дневной отчёт этим слоем не кэшируем — ввод идёт днём.
 */
import { createGlanceCache } from '../homeGlanceCache.js'

const cache = createGlanceCache({
  ns: 'admin-sales-shell',
  ttlMs: 6 * 60 * 60 * 1000,
})

export const SALES_SHELL_SESSION_TTL_MS = cache.ttlMs

function parts(clubId, reportDate) {
  return [String(clubId ?? '').trim(), String(reportDate ?? '').slice(0, 10)]
}

/** @returns {{ payload: object, savedAt: number } | null} */
export function readSalesShellSession(clubId, reportDate) {
  return cache.read(parts(clubId, reportDate))
}

export function peekSalesShellSession(clubId, reportDate) {
  return cache.peek(parts(clubId, reportDate))
}

export function writeSalesShellSession(clubId, reportDate, payload) {
  cache.write(parts(clubId, reportDate), payload)
}

export function clearSalesShellSession(clubId) {
  cache.invalidate({ clubId })
}

export function invalidateSalesShellSession(clubId) {
  clearSalesShellSession(clubId)
}

export function isSalesShellSessionFresh(savedAt, ttlMs = SALES_SHELL_SESSION_TTL_MS) {
  return cache.isFresh(savedAt, ttlMs)
}
