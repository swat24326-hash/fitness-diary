/**
 * Deep-link Планёрки — куда вести исполнителя по контексту задания (O2).
 */

import { resolveDeepLinkForTaskKind } from './iskraTaskKindsCore.js'

/**
 * @param {{
 *   deep_link?: string,
 *   task_kind?: string,
 *   context_json?: Record<string, unknown>,
 *   recipient_role?: 'trainer' | 'sales_manager' | 'admin',
 * }} row
 */
export function resolveDispatchDeepLink(row) {
  const stored = String(row?.deep_link ?? '').trim()
  const ctx = row?.context_json && typeof row.context_json === 'object' ? row.context_json : {}
  const taskKind = String(row?.task_kind ?? 'custom').trim()
  const role = String(row?.recipient_role ?? 'trainer').trim()

  const clientId = String(ctx.client_id ?? '').trim()
  if (clientId) {
    if (role === 'admin') {
      const clubId = String(ctx.club_id ?? '').trim()
      const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''
      return `/admin/clients/${clientId}${clubQs}`
    }
    if (role === 'sales_manager') {
      return `/sales/clients/${clientId}`
    }
    return `/trainer/clients/${clientId}`
  }

  const reportDate = String(ctx.report_date ?? '').trim()
  if (reportDate && /^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    const dateQs = `date=${encodeURIComponent(reportDate)}`
    if (role === 'admin') {
      const clubId = String(ctx.club_id ?? '').trim()
      const clubPart = clubId ? `club=${encodeURIComponent(clubId)}&` : ''
      return `/admin/sales?${clubPart}tab=daily&${dateQs}`
    }
    return `/sales?tab=report&${dateQs}`
  }

  if (stored) return stored
  return resolveDeepLinkForTaskKind(taskKind)
}

/**
 * @param {string} clientId
 * @param {{ clubId?: string, forAdmin?: boolean }} [opts]
 */
export function buildClientCardDeepLink(clientId, opts = {}) {
  const id = String(clientId ?? '').trim()
  if (!id) return '/trainer/clients'
  const clubId = String(opts.clubId ?? '').trim()
  const clubQs = clubId ? `?club=${encodeURIComponent(clubId)}` : ''
  if (opts.forSales) return `/sales/clients/${id}${clubQs}`
  if (opts.forAdmin) return `/admin/clients/${id}${clubQs}`
  return `/trainer/clients/${id}`
}

/**
 * @param {{ reportDate: string, clubId?: string, forAdmin?: boolean }} opts
 */
export function buildSalesReportDeepLink(opts) {
  const date = String(opts.reportDate ?? '').trim()
  const dateQs = date ? `date=${encodeURIComponent(date)}` : ''
  if (opts.forAdmin) {
    const clubId = String(opts.clubId ?? '').trim()
    const clubPart = clubId ? `club=${encodeURIComponent(clubId)}&` : ''
    return `/admin/sales?${clubPart}tab=daily${dateQs ? `&${dateQs}` : ''}`
  }
  const base = '/sales?tab=report'
  return dateQs ? `${base}&${dateQs}` : base
}
