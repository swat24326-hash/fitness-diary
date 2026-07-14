export const ADMIN_CLIENT_QUICK_FILTERS = ['all', 'inactive', 'active_today', 'expiring', 'expired_remaining']

/** @param {string} filter */
export function isAdminClientQuickFilter(filter) {
  return ADMIN_CLIENT_QUICK_FILTERS.includes(String(filter ?? ''))
}

/**
 * @param {string} path e.g. `/admin/clients`
 * @param {{ clubId?: string, filter?: string, period?: string, panel?: string }} p
 */
export function buildAdminClubQueryHref(path, p = {}) {
  const qs = new URLSearchParams()
  const clubId = String(p.clubId ?? '').trim()
  if (clubId) qs.set('club', clubId)
  if (p.filter) qs.set('filter', p.filter)
  if (p.period) qs.set('period', p.period)
  if (p.panel) qs.set('panel', p.panel)
  const tail = qs.toString()
  return tail ? `${path}?${tail}` : path
}
