/** Права менеджера по продажам (чистая логика, без React). */

import { USERS_SALES_MANAGER_ROLES } from '../userRoleConstants.js'

/** @param {string} [role] */
export function normalizeAppRole(role) {
  const r = String(role ?? '').trim().toLowerCase()
  if (r === 'admin' || r === 'администратор') return 'admin'
  if (r === 'trainer' || r === 'тренер') return 'trainer'
  if (USERS_SALES_MANAGER_ROLES.includes(r)) return 'sales_manager'
  if (r === 'supervisor' || r === 'управляющий') return 'supervisor'
  return r || 'trainer'
}

/** @param {string} [role] */
export function isSalesManagerRole(role) {
  return normalizeAppRole(role) === 'sales_manager'
}

/** @param {string} [profileClubId] @param {string} [requestedClubId] */
export function canSalesManagerAccessClub(profileClubId, requestedClubId) {
  const club = String(profileClubId ?? '').trim()
  const req = String(requestedClubId ?? '').trim()
  if (!club || !req) return false
  return club === req
}

/**
 * @param {'levels'|'directions'|'all'|string} scope
 * @param {boolean} isSalesManager
 */
export function assertSalesPlanScopeForRole(scope, isSalesManager) {
  if (!isSalesManager) return { ok: true }
  if (scope === 'directions' || scope === 'strategy_snapshot') return { ok: true }
  return { ok: false, error: 'Только администратор может менять уровни плана, акции и финансы' }
}

/** @param {boolean} isSalesManagerUser */
export function stripSalesBundleForManager(bundle, isSalesManagerUser) {
  if (!isSalesManagerUser || !bundle || typeof bundle !== 'object') return bundle
  const next = { ...bundle }
  delete next.expense
  if (next.month_summary && typeof next.month_summary === 'object') {
    const ms = { ...next.month_summary }
    delete ms.expense
    delete ms.trainerPayroll
    delete ms.aerobicPayroll
    delete ms.netProfit
    delete ms.hallFinance
    next.month_summary = ms
  }
  if (next.monthSummary && typeof next.monthSummary === 'object') {
    const ms = { ...next.monthSummary }
    delete ms.expense
    delete ms.trainerPayroll
    delete ms.aerobicPayroll
    delete ms.netProfit
    delete ms.hallFinance
    next.monthSummary = ms
  }
  return next
}

/** Менеджер по продажам не видит ЗП в UI и API bundle. */
export function canViewSalesPayroll(roleOrMode) {
  const r = String(roleOrMode ?? '').trim()
  return r !== 'sales_manager'
}

/** Прогноз финансов: менеджеру — только план и направления, админу — полный блок. */
export function salesFinanceForecastVariantForRole(roleOrMode) {
  return isSalesManagerRole(roleOrMode) || String(roleOrMode ?? '').trim() === 'sales_manager' ? 'plan' : 'full'
}
