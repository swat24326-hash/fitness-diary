/**
 * Связь роли приложения → роль советника ИСКРЫ и фильтрация snapshot.
 */

import {
  USERS_ADMIN_ROLES,
  USERS_SALES_MANAGER_ROLES,
  USERS_TRAINER_ROLES,
} from '../userRoleConstants.js'
import { resolveIskraAdvisorRole } from './iskraAdvisorRoles.js'

/** @param {string} [rawRole] */
export function normalizeAppRoleForIskra(rawRole) {
  const r = String(rawRole ?? '').trim().toLowerCase()
  if (USERS_ADMIN_ROLES.some((x) => x.toLowerCase() === r)) return 'admin'
  if (USERS_SALES_MANAGER_ROLES.some((x) => x.toLowerCase() === r)) return 'sales_manager'
  if (USERS_TRAINER_ROLES.some((x) => x.toLowerCase() === r)) return 'trainer'
  return 'admin'
}

/**
 * ИСКРА в админке сейчас только у admin → app_admin.
 * club_supervisor / curator — см. docs/CLUB_SUPERVISOR.md, docs/ISKRA_CURATOR.md
 *
 * @param {string} [appRole]
 * @returns {import('./iskraAdvisorRoles.js').IskraAdvisorRoleId}
 */
export function mapAppRoleToAdvisorRole(appRole) {
  const normalized = normalizeAppRoleForIskra(appRole)
  if (normalized === 'admin') return 'app_admin'
  // Будущее:
  // if (isSupervisorAppRole(appRole)) return 'club_supervisor'
  // if (isCuratorAppRole(appRole)) return 'curator'
  return 'app_admin'
}

/**
 * @param {object | null | undefined} snapshot
 * @param {import('./iskraAdvisorRoles.js').IskraAdvisorRoleId} advisorRoleId
 */
export function filterSnapshotForAdvisorRole(snapshot, advisorRoleId) {
  if (!snapshot) return snapshot
  const role = resolveIskraAdvisorRole(advisorRoleId)
  const hidden = new Set(role.hiddenTopicIds)
  if (!hidden.size) return snapshot

  const next = { ...snapshot }

  if (
    hidden.has('net_profit') ||
    hidden.has('trainer_payroll') ||
    hidden.has('payroll_margin') ||
    hidden.has('club_finance_net')
  ) {
    next.finance = undefined
    if (next.insights) {
      const insights = { ...next.insights }
      delete insights.finance
      next.insights = insights
    }
    if (next.club_finance?.forecast) {
      const cf = { ...next.club_finance, forecast: { ...next.club_finance.forecast } }
      delete cf.forecast.net_profit_rub
      next.club_finance = cf
    }
  }

  if (hidden.has('supervisor_expense') && next.finance) {
    const finance = { ...next.finance }
    delete finance.supervisor_expense
    next.finance = finance
  }

  if (hidden.has('sales_plan') || hidden.has('sales_structure') || hidden.has('pnk')) {
    if (next.insights) {
      const insights = { ...next.insights }
      if (hidden.has('sales_plan')) delete insights.plan
      if (hidden.has('sales_structure')) delete insights.structure
      if (hidden.has('pnk')) delete insights.pnk
      next.insights = insights
    }
  }

  if (hidden.has('trainer_clients') || hidden.has('inactive_clients')) {
    next.trainer_contour = undefined
  }

  return next
}
