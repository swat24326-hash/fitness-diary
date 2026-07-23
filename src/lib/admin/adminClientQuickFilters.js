import { normalizeAdminClientQuickFilter } from './adminClientsFunnelCore.js'

export const ADMIN_CLIENT_QUICK_FILTERS = [
  'all',
  'inactive',
  'pnk',
  'awaiting_start',
  'birthdays',
  'expiring',
  'expired_recent',
  'stale',
]

/** @param {string} filter */
export function isAdminClientQuickFilter(filter) {
  const n = normalizeAdminClientQuickFilter(filter)
  return ADMIN_CLIENT_QUICK_FILTERS.includes(n)
}

/**
 * @param {string} path e.g. `/admin/clients`
 * @param {{ clubId?: string, filter?: string, period?: string, panel?: string }} p
 */
export function buildAdminClubQueryHref(path, p = {}) {
  const qs = new URLSearchParams()
  const clubId = String(p.clubId ?? '').trim()
  if (clubId) qs.set('club', clubId)
  if (p.filter) {
    const f = normalizeAdminClientQuickFilter(p.filter)
    if (f && f !== 'none') qs.set('filter', f)
  }
  if (p.period) qs.set('period', p.period)
  if (p.panel) qs.set('panel', p.panel)
  const tail = qs.toString()
  return tail ? `${path}?${tail}` : path
}

export { normalizeAdminClientQuickFilter }
