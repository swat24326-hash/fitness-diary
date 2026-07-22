/**
 * node scripts/verify-admin-client-quick-filters.mjs
 */
import {
  ADMIN_CLIENT_QUICK_FILTERS,
  buildAdminClubQueryHref,
  isAdminClientQuickFilter,
} from '../src/lib/admin/adminClientQuickFilters.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(ADMIN_CLIENT_QUICK_FILTERS.includes('inactive'), 'inactive in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('expiring'), 'expiring in filters')
ok(isAdminClientQuickFilter('expiring'), 'expiring filter')
ok(isAdminClientQuickFilter('inactive'), 'inactive filter')
ok(!isAdminClientQuickFilter('stale'), 'reject trainer-only filter')

ok(
  buildAdminClubQueryHref('/admin/clients', { clubId: 'c1', filter: 'expiring' }) ===
    '/admin/clients?club=c1&filter=expiring',
  'clients expiring href',
)
ok(
  buildAdminClubQueryHref('/admin/clients', { clubId: 'c1', filter: 'inactive' }) ===
    '/admin/clients?club=c1&filter=inactive',
  'clients inactive href',
)
ok(
  buildAdminClubQueryHref('/admin/statistics', { clubId: 'c1', period: 'today', panel: 'inactive' }) ===
    '/admin/statistics?club=c1&period=today&panel=inactive',
  'statistics inactive href still builds',
)

if (failed) process.exit(1)
console.log('verify-admin-client-quick-filters: all passed')
