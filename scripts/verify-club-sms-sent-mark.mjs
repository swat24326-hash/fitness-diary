/**
 * node scripts/verify-club-sms-sent-mark.mjs
 */
import {
  calendarDaysBetween,
  clubSmsLogMarksInFilter,
  clubSmsMarkChipLabel,
  clubSmsMarkTtlDays,
  isExtendedClubSmsMarkFilter,
  mapClubSmsMarksByClient,
  resolveClientClubSmsScenario,
  resolveClubSmsLogScenario,
} from '../src/lib/admin/clubSmsSentMarkCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isExtendedClubSmsMarkFilter('expiring'), 'expiring extended')
ok(isExtendedClubSmsMarkFilter('expired_recent'), 'expired_recent extended')
ok(isExtendedClubSmsMarkFilter('stale'), 'stale extended')
ok(!isExtendedClubSmsMarkFilter('birthdays'), 'birthdays not extended')
ok(clubSmsMarkTtlDays('expiring') === 5, 'expiring ttl 5')
ok(clubSmsMarkTtlDays('expired_recent') === 14, 'expired_recent ttl 14')
ok(clubSmsMarkTtlDays('stale') === 14, 'stale ttl 14')
ok(clubSmsMarkTtlDays('all') === 1, 'all ttl 1')
ok(clubSmsMarkChipLabel('all', 'expired_recent') === 'уже', 'chip already from mark')
ok(clubSmsMarkChipLabel('inactive', 'custom') === 'сегодня', 'chip today')

ok(calendarDaysBetween('2026-07-20', '2026-07-22') === 2, 'days between')

const today = '2026-07-22'

const expiredMem = [{ start_date: '2026-01-01', end_date: '2026-07-15', total_trainings: 10, used_trainings: 10 }]
ok(
  resolveClientClubSmsScenario({ memList: expiredMem, today }) === 'expired_recent',
  'client scenario expired_recent',
)

const staleMem = [{ start_date: '2026-01-01', end_date: '2026-07-01', total_trainings: 10, used_trainings: 10 }]
ok(resolveClientClubSmsScenario({ memList: staleMem, today }) === 'stale', 'client scenario stale')

const expiringMem = [{ start_date: '2026-01-01', end_date: '2026-07-24', total_trainings: 10, used_trainings: 1 }]
ok(resolveClientClubSmsScenario({ memList: expiringMem, today }) === 'expiring', 'client scenario expiring')

ok(
  resolveClubSmsLogScenario({
    mode: 'custom',
    client: {},
    memList: expiredMem,
    today,
  }) === 'expired_recent',
  'log scenario from client basket when custom',
)
ok(
  resolveClubSmsLogScenario({
    mode: 'template',
    scenario: 'expiring',
    memList: expiredMem,
    today,
  }) === 'expiring',
  'log scenario keeps template filter',
)

const expiredLog = {
  client_id: 'c1',
  scenario: 'expired_recent',
  created_at: '2026-07-15T12:00:00.000Z',
}
ok(
  clubSmsLogMarksInFilter(expiredLog, {
    today,
    viewingFilter: 'expired_recent',
    clientScenario: 'expired_recent',
  }),
  'expired_recent mark in own filter day 7',
)
ok(
  clubSmsLogMarksInFilter(expiredLog, {
    today,
    viewingFilter: 'all',
    clientScenario: 'expired_recent',
  }),
  'expired_recent mark visible on all while still in basket',
)
ok(
  !clubSmsLogMarksInFilter(expiredLog, {
    today,
    viewingFilter: 'all',
    clientScenario: 'stale',
  }),
  'expired_recent mark hidden on all after moved to stale',
)
ok(
  !clubSmsLogMarksInFilter(expiredLog, {
    today,
    viewingFilter: 'stale',
    clientScenario: 'stale',
  }),
  'expired_recent log not shown on stale filter',
)
ok(
  !clubSmsLogMarksInFilter(
    { ...expiredLog, created_at: '2026-07-08T12:00:00.000Z' },
    { today, viewingFilter: 'expired_recent', clientScenario: 'expired_recent' },
  ),
  'expired_recent mark gone after 14d',
)

const expiringLog = {
  client_id: 'c2',
  scenario: 'expiring',
  created_at: '2026-07-20T12:00:00.000Z',
}
ok(
  clubSmsLogMarksInFilter(expiringLog, { today, viewingFilter: 'expiring', clientScenario: 'expiring' }),
  'expiring mark day 2',
)
ok(
  clubSmsLogMarksInFilter(expiringLog, { today, viewingFilter: 'all', clientScenario: 'expiring' }),
  'expiring mark on all while still expiring',
)

const todayCustom = {
  client_id: 'c3',
  scenario: 'custom',
  created_at: '2026-07-22T10:00:00.000Z',
}
ok(
  clubSmsLogMarksInFilter(todayCustom, { today, viewingFilter: 'inactive', clientScenario: 'custom' }),
  'custom today on inactive',
)

const map = mapClubSmsMarksByClient([expiredLog, expiringLog, todayCustom], {
  today,
  viewingFilter: 'all',
  clientScenarioById: {
    c1: 'expired_recent',
    c2: 'expiring',
    c3: 'custom',
  },
})
ok(map.has('c1') && map.has('c2') && map.has('c3'), 'map all three on broad view')

const mapExpiredOnly = mapClubSmsMarksByClient([expiredLog, expiringLog], {
  today,
  viewingFilter: 'expired_recent',
  clientScenarioById: { c1: 'expired_recent', c2: 'expiring' },
})
ok(mapExpiredOnly.has('c1') && !mapExpiredOnly.has('c2'), 'narrow filter only matching scenario')

if (failed) process.exit(1)
console.log('\nverify-club-sms-sent-mark: all passed')
