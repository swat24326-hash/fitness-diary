/**
 * Session-кэш sales profile=shell (месяц / план / расход).
 * Дневной отчёт этим слоем не кэшируем — ввод идёт днём.
 *
 * SWR: last-good сразу, сеть при открытии (кроме очень свежего после своего save).
 * TTL 6ч ломал шляпу: менеджер сохранил отчёт — у админа месяц оставался старым.
 */
import { createGlanceCache } from '../homeGlanceCache.js'

/** Показ last-good; «совсем не ходить в сеть» — только короткий skip. */
const cache = createGlanceCache({
  ns: 'admin-sales-shell',
  ttlMs: 5 * 60 * 1000,
})

export const SALES_SHELL_SESSION_TTL_MS = cache.ttlMs

/** После своего «Сохранить»/Обновить не дублировать shell-запрос. */
export const SALES_SHELL_SKIP_NETWORK_MS = 45 * 1000

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

/** Можно ли пропустить сеть (только что сами сохранили/обновили). */
export function shouldSkipSalesShellNetwork(savedAt) {
  return cache.isFresh(savedAt, SALES_SHELL_SKIP_NETWORK_MS)
}
