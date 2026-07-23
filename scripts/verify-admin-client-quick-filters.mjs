/**
 * node scripts/verify-admin-client-quick-filters.mjs
 */
import {
  ADMIN_CLIENT_QUICK_FILTERS,
  buildAdminClubQueryHref,
  isAdminClientQuickFilter,
  normalizeAdminClientQuickFilter,
} from '../src/lib/admin/adminClientQuickFilters.js'
import {
  clientMatchesAdminFunnelFilter,
  countAdminFunnelFilters,
  isAwaitingMembershipStart,
} from '../src/lib/admin/adminClientsFunnelCore.js'
import {
  hasUpcomingMembership,
  inactiveMembershipReason,
} from '../src/lib/membershipRules.js'
import {
  isClientStaleForAttention,
  isMembershipExpiredRecently,
} from '../src/lib/trainer/trainerClientOutreachCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(ADMIN_CLIENT_QUICK_FILTERS.includes('inactive'), 'inactive in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('awaiting_start'), 'awaiting_start in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('expiring'), 'expiring in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('birthdays'), 'birthdays in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('expired_recent'), 'expired_recent in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('stale'), 'stale in filters')
ok(!ADMIN_CLIENT_QUICK_FILTERS.includes('active_today'), 'no active_today tile')
ok(!ADMIN_CLIENT_QUICK_FILTERS.includes('expired_remaining'), 'no expired_remaining tile')

ok(isAdminClientQuickFilter('expiring'), 'expiring filter')
ok(isAdminClientQuickFilter('awaiting_start'), 'awaiting_start filter')
ok(isAdminClientQuickFilter('stale'), 'stale filter')
ok(isAdminClientQuickFilter('expired_remaining'), 'alias expired_remaining accepted')
ok(normalizeAdminClientQuickFilter('expired_remaining') === 'expired_recent', 'alias → expired_recent')
ok(normalizeAdminClientQuickFilter('active_today') === 'none', 'active_today dropped')

ok(
  buildAdminClubQueryHref('/admin/clients', { clubId: 'c1', filter: 'expiring' }) ===
    '/admin/clients?club=c1&filter=expiring',
  'clients expiring href',
)
ok(
  buildAdminClubQueryHref('/admin/clients', { clubId: 'c1', filter: 'awaiting_start' }) ===
    '/admin/clients?club=c1&filter=awaiting_start',
  'clients awaiting_start href',
)
ok(
  buildAdminClubQueryHref('/admin/clients', { clubId: 'c1', filter: 'expired_remaining' }) ===
    '/admin/clients?club=c1&filter=expired_recent',
  'href normalizes expired_remaining',
)
ok(
  buildAdminClubQueryHref('/admin/statistics', { clubId: 'c1', period: 'today', panel: 'inactive' }) ===
    '/admin/statistics?club=c1&period=today&panel=inactive',
  'statistics inactive href still builds',
)

const today = '2026-07-22'
const day13 = [{ start_date: '2026-01-01', end_date: '2026-07-09', total_trainings: 10, used_trainings: 10 }]
const day14 = [{ start_date: '2026-01-01', end_date: '2026-07-08', total_trainings: 10, used_trainings: 10 }]

ok(isMembershipExpiredRecently(day13, today), 'day 13 → expired_recent')
ok(!isClientStaleForAttention({ memList: day13, today }), 'day 13 not stale')
ok(!isMembershipExpiredRecently(day14, today), 'day 14 not expired_recent')
ok(isClientStaleForAttention({ memList: day14, today }), 'day 14 → stale')

const gap = [
  { start_date: '2026-01-01', end_date: '2026-07-01', total_trainings: 10, used_trainings: 10 },
  { start_date: '2026-08-01', end_date: '2026-09-01', total_trainings: 8, used_trainings: 0 },
]
ok(hasUpcomingMembership(gap, today), 'gap has upcoming')
ok(inactiveMembershipReason(gap, today) === 'not_started', 'gap reason not_started')
ok(!isMembershipExpiredRecently(gap, today), 'gap not expired_recent')
ok(!isClientStaleForAttention({ memList: gap, today }), 'gap not stale')

const depletedPlusUpcoming = [
  { start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 10, used_trainings: 10 },
  { start_date: '2026-08-01', end_date: '2026-09-01', total_trainings: 8, used_trainings: 0 },
]
ok(hasUpcomingMembership(depletedPlusUpcoming, today), 'depleted+upcoming has upcoming')
ok(
  inactiveMembershipReason(depletedPlusUpcoming, today) === 'not_started',
  'depleted covering + upcoming → not_started (не в «Не активные»)',
)
ok(
  isAwaitingMembershipStart(depletedPlusUpcoming, today),
  'depleted+upcoming → awaiting_start',
)

const clients = [
  { id: 'b', birth_date: '1990-07-22' },
  { id: 'e', birth_date: '1990-01-01' },
  { id: 'r', birth_date: '1990-01-01' },
  { id: 's', birth_date: '1990-01-01' },
  { id: 'a', birth_date: '1990-01-01' },
]
const memByClient = {
  b: [{ start_date: '2026-01-01', end_date: '2026-12-01', total_trainings: 10, used_trainings: 1 }],
  e: [{ start_date: '2026-01-01', end_date: '2026-07-24', total_trainings: 10, used_trainings: 1 }],
  r: day13,
  s: day14,
  a: gap,
}
const inactiveIds = new Set(['r', 's'])
const counts = countAdminFunnelFilters(clients, memByClient, today, inactiveIds)
ok(counts.birthdays === 1, 'count birthdays')
ok(counts.awaiting_start === 1, 'count awaiting_start')
ok(counts.expiring === 1, 'count expiring')
ok(counts.expired_recent === 1, 'count expired_recent')
ok(counts.stale === 1, 'count stale')

ok(
  clientMatchesAdminFunnelFilter('birthdays', {
    client: clients[0],
    memList: memByClient.b,
    today,
  }),
  'match birthday',
)
ok(
  clientMatchesAdminFunnelFilter('awaiting_start', {
    client: { id: 'a' },
    memList: gap,
    today,
  }),
  'match awaiting_start',
)
ok(
  !clientMatchesAdminFunnelFilter('inactive', {
    client: { id: 'a' },
    memList: gap,
    today,
    inactiveIds,
  }),
  'awaiting_start not in inactive set',
)

if (failed) process.exit(1)
console.log('verify-admin-client-quick-filters: all passed')
