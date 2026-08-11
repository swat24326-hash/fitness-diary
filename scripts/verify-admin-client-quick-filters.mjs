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
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('pnk'), 'pnk in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('awaiting_start'), 'awaiting_start in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('expiring'), 'expiring in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('birthdays'), 'birthdays in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('expired_recent'), 'expired_recent in filters')
ok(ADMIN_CLIENT_QUICK_FILTERS.includes('stale'), 'stale in filters')
ok(!ADMIN_CLIENT_QUICK_FILTERS.includes('active_today'), 'no active_today tile')
ok(!ADMIN_CLIENT_QUICK_FILTERS.includes('expired_remaining'), 'no expired_remaining tile')

ok(isAdminClientQuickFilter('expiring'), 'expiring filter')
ok(isAdminClientQuickFilter('pnk'), 'pnk filter')
ok(isAdminClientQuickFilter('awaiting_start'), 'awaiting_start filter')
ok(isAdminClientQuickFilter('stale'), 'stale filter')
ok(isAdminClientQuickFilter('expired_remaining'), 'alias expired_remaining accepted')
ok(normalizeAdminClientQuickFilter('expired_remaining') === 'expired_recent', 'alias → expired_recent')
ok(normalizeAdminClientQuickFilter('active_today') === 'none', 'active_today dropped')

ok(
  buildAdminClubQueryHref('/admin/clients', { clubId: 'c1', filter: 'pnk' }) ===
    '/admin/clients?club=c1&filter=pnk',
  'clients pnk href',
)
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
  'statistics panel=inactive URL still builds (UI redirects to Clients)',
)
ok(
  buildAdminClubQueryHref('/admin/clients', { clubId: 'c1', filter: 'inactive' }) ===
    '/admin/clients?club=c1&filter=inactive',
  'clients inactive is canonical href',
)

const today = '2026-07-22'
const day13 = [{ start_date: '2026-01-01', end_date: '2026-07-09', total_trainings: 10, used_trainings: 10 }]
const day14 = [{ start_date: '2026-01-01', end_date: '2026-07-08', total_trainings: 10, used_trainings: 10 }]

ok(isMembershipExpiredRecently(day13, today), 'day 13 → expired_recent')
ok(!isClientStaleForAttention({ memList: day13, today }), 'day 13 not stale')
ok(!isMembershipExpiredRecently(day14, today), 'day 14 not expired_recent')
ok(isClientStaleForAttention({ memList: day14, today }), 'day 14 → stale')

const day60 = [{ start_date: '2026-01-01', end_date: '2026-05-23', total_trainings: 10, used_trainings: 10 }]
const day61 = [{ start_date: '2026-01-01', end_date: '2026-05-22', total_trainings: 10, used_trainings: 10 }]
ok(isClientStaleForAttention({ memList: day60, today }), 'day 60 → still stale')
ok(!isClientStaleForAttention({ memList: day61, today }), 'day 61 → out of stale window')

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
  { id: 'p', birth_date: '1990-01-01', lifecycle: 'pnk' },
  { id: 't', birth_date: '1990-01-01' },
  { id: 'n', birth_date: '1990-01-01' },
]
const memByClient = {
  b: [{ start_date: '2026-01-01', end_date: '2026-12-01', total_trainings: 10, used_trainings: 1 }],
  e: [{ start_date: '2026-01-01', end_date: '2026-07-24', total_trainings: 10, used_trainings: 1 }],
  r: day13,
  s: day14,
  a: gap,
  p: [],
  t: day61,
  n: [],
}
const inactiveIds = new Set(['r', 's', 't', 'n'])
const counts = countAdminFunnelFilters(clients, memByClient, today, inactiveIds)
ok(counts.pnk === 1, 'count pnk')
ok(counts.birthdays === 1, 'count birthdays')
ok(counts.awaiting_start === 1, 'count awaiting_start')
ok(counts.expiring === 1, 'count expiring')
ok(counts.expired_recent === 1, 'count expired_recent')
ok(counts.stale === 1, 'count stale')
ok(counts.inactive === 2, 'count inactive = tail 61+ + no membership (not r/s)')
ok(
  !clientMatchesAdminFunnelFilter('inactive', {
    client: { id: 'r' },
    memList: day13,
    today,
  }),
  'expired_recent not in inactive',
)
ok(
  !clientMatchesAdminFunnelFilter('inactive', {
    client: { id: 's' },
    memList: day14,
    today,
  }),
  'stale not in inactive',
)
ok(
  clientMatchesAdminFunnelFilter('inactive', {
    client: { id: 't' },
    memList: day61,
    today,
  }),
  'day 61 → inactive funnel tail',
)
ok(
  clientMatchesAdminFunnelFilter('inactive', {
    client: { id: 'n' },
    memList: [],
    today,
  }),
  'no membership → inactive (strange/empty)',
)
ok(
  clientMatchesAdminFunnelFilter('pnk', { client: { id: 'p', lifecycle: 'pnk' }, today }),
  'match pnk',
)
ok(
  !clientMatchesAdminFunnelFilter('pnk', { client: { id: 'b', lifecycle: 'active' }, today }),
  'regular not pnk',
)
ok(
  clientMatchesAdminFunnelFilter('birthdays', {
    client: clients[0],
    memList: memByClient.b,
    today,
  }),
  'match birthday today',
)
ok(
  clientMatchesAdminFunnelFilter('birthdays', {
    client: { id: 'soon', birth_date: '1990-08-01' },
    today,
  }),
  'match birthday upcoming within 30 days',
)
ok(
  !clientMatchesAdminFunnelFilter('birthdays', {
    client: { id: 'far', birth_date: '1990-10-01' },
    today,
  }),
  'no match birthday beyond 30 days',
)
ok(counts.birthdays === 1, 'chip count birthdays = today only')
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

const deskToday = '2026-07-22'
const deskExpiring = [
  { hall: 'tz', start_date: '2026-01-01', end_date: '2026-07-24', total_trainings: 0, used_trainings: 0 },
]
const deskExpired = [
  { hall: 'tz', start_date: '2026-01-01', end_date: '2026-07-15', total_trainings: 0, used_trainings: 0 },
]
const deskFuture = [
  { hall: 'tz', start_date: '2026-08-01', end_date: '2026-09-01', total_trainings: 0, used_trainings: 0 },
]
ok(
  clientMatchesAdminFunnelFilter('expiring', {
    client: { id: 'd1', desk_hall: 'tz' },
    memList: deskExpiring,
    today: deskToday,
    hallMode: 'tz',
  }),
  'tz expiring by calendar',
)
ok(
  !clientMatchesAdminFunnelFilter('expiring', {
    client: { id: 'd-multi', desk_hall: null, trainer_id: 't1' },
    memList: [
      {
        hall: 'pz',
        start_date: '2026-01-01',
        end_date: '2026-07-24',
        total_trainings: 12,
        used_trainings: 0,
      },
      {
        hall: 'tz',
        start_date: '2026-01-01',
        end_date: '2027-01-01',
        total_trainings: 0,
        used_trainings: 0,
      },
    ],
    today: deskToday,
    hallMode: 'tz',
  }),
  'multi-hall: tz filter ignores expiring pz package',
)
ok(
  clientMatchesAdminFunnelFilter('expiring', {
    client: { id: 'd-multi2', desk_hall: null, trainer_id: 't1' },
    memList: [
      {
        hall: 'pz',
        start_date: '2026-01-01',
        end_date: '2026-07-24',
        total_trainings: 12,
        used_trainings: 0,
      },
      {
        hall: 'tz',
        start_date: '2026-01-01',
        end_date: '2026-07-24',
        total_trainings: 0,
        used_trainings: 0,
      },
    ],
    today: deskToday,
    hallMode: 'tz',
  }),
  'multi-hall: tz expiring uses tz row only',
)

ok(
  clientMatchesAdminFunnelFilter('expired_recent', {
    client: { id: 'd2' },
    memList: deskExpired,
    today: deskToday,
    hallMode: 'tz',
  }),
  'tz expired_recent by calendar',
)
ok(
  clientMatchesAdminFunnelFilter('awaiting_start', {
    client: { id: 'd3' },
    memList: deskFuture,
    today: deskToday,
    hallMode: 'tz',
  }),
  'tz awaiting_start by calendar',
)
ok(
  !clientMatchesAdminFunnelFilter('pnk', {
    client: { id: 'd4', lifecycle: 'pnk' },
    today: deskToday,
    hallMode: 'tz',
  }),
  'tz mode ignores pnk',
)
const deskCounts = countAdminFunnelFilters(
  [
    { id: 'd1' },
    { id: 'd2' },
    { id: 'd3' },
  ],
  { d1: deskExpiring, d2: deskExpired, d3: deskFuture },
  deskToday,
  new Set(),
  { hallMode: 'tz' },
)
ok(deskCounts.pnk === 0 && deskCounts.expiring === 1 && deskCounts.awaiting_start === 1, 'tz counts')

// АЗ: календарь покрывает, но занятия = 0 → не «жив» (как ПЗ)
const azCoveredNoSessions = [
  { hall: 'az', start_date: '2026-01-01', end_date: '2026-12-01', total_trainings: 0, used_trainings: 0 },
]
const azUsable = [
  { hall: 'az', start_date: '2026-01-01', end_date: '2026-12-01', total_trainings: 8, used_trainings: 2 },
]
const azDepletedInPeriod = [
  { hall: 'az', start_date: '2026-01-01', end_date: '2026-12-01', total_trainings: 8, used_trainings: 8 },
]
ok(
  !clientMatchesAdminFunnelFilter('expiring', {
    client: { id: 'az0' },
    memList: azCoveredNoSessions,
    today: deskToday,
    hallMode: 'az',
  }),
  'az calendar-only package not expiring (needs sessions)',
)
ok(
  clientMatchesAdminFunnelFilter('inactive', {
    client: { id: 'az0' },
    memList: azCoveredNoSessions,
    today: deskToday,
    hallMode: 'az',
  }),
  'az calendar-only total=0 covering → inactive (strange for session hall)',
)
ok(
  !clientMatchesAdminFunnelFilter('inactive', {
    client: { id: 'az1' },
    memList: azUsable,
    today: deskToday,
    hallMode: 'az',
  }),
  'az with remaining not inactive',
)
ok(
  !clientMatchesAdminFunnelFilter('inactive', {
    client: { id: 'az2' },
    memList: azDepletedInPeriod,
    today: deskToday,
    hallMode: 'az',
  }),
  'az depleted → not inactive (earlier stage Закончился)',
)
ok(
  clientMatchesAdminFunnelFilter('expired_recent', {
    client: { id: 'az2' },
    memList: azDepletedInPeriod,
    today: deskToday,
    hallMode: 'az',
  }),
  'az depleted sessions → expired_recent (hot renew)',
)
ok(
  isMembershipExpiredRecently(azDepletedInPeriod, deskToday),
  'isMembershipExpiredRecently includes depleted-in-period',
)

const pnkTrialDepleted = [
  { start_date: '2026-07-01', end_date: '2026-08-31', total_trainings: 1, used_trainings: 1 },
]
ok(
  isMembershipExpiredRecently(pnkTrialDepleted, deskToday),
  'trial 1/1 depleted matches membership rule',
)
ok(
  !clientMatchesAdminFunnelFilter('expired_recent', {
    client: { id: 'pnk1', lifecycle: 'pnk' },
    memList: pnkTrialDepleted,
    today: deskToday,
    hallMode: 'pz',
  }),
  'open PNK not in expired_recent (funnel chip only)',
)
ok(
  !clientMatchesAdminFunnelFilter('expiring', {
    client: { id: 'pnk1', lifecycle: 'pnk' },
    memList: [{ start_date: '2026-07-01', end_date: '2026-07-24', total_trainings: 1, used_trainings: 0 }],
    today: deskToday,
    hallMode: 'pz',
  }),
  'open PNK not in expiring',
)
ok(
  clientMatchesAdminFunnelFilter('pnk', {
    client: { id: 'pnk1', lifecycle: 'pnk' },
    memList: pnkTrialDepleted,
    today: deskToday,
    hallMode: 'pz',
  }),
  'open PNK still matches pnk filter',
)
ok(
  clientMatchesAdminFunnelFilter('expired_recent', {
    client: { id: 'dk1', lifecycle: 'active' },
    memList: pnkTrialDepleted,
    today: deskToday,
    hallMode: 'pz',
  }),
  'regular client with depleted package still expired_recent',
)

if (failed) process.exit(1)
console.log('verify-admin-client-quick-filters: all passed')
