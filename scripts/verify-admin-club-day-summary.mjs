/**
 * node scripts/verify-admin-club-day-summary.mjs
 */
import {
  buildAdminClubDaySummary,
  countTrainingsOnDate,
  shouldReloadAdminDaySummary,
  yesterdayIso,
} from '../src/lib/admin/adminClubDaySummaryCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(yesterdayIso('2026-07-11') === '2026-07-10', 'yesterdayIso')

const counts = countTrainingsOnDate(
  [
    { date: '2026-07-11', status: 'completed' },
    { date: '2026-07-11', status: 'draft' },
    { date: '2026-07-10', status: 'completed' },
  ],
  '2026-07-11',
)
ok(counts.completed === 1 && counts.draft === 1, 'countTrainingsOnDate')

const today = '2026-07-11'
const summary = buildAdminClubDaySummary({
  today,
  yesterday: '2026-07-10',
  clients: [
    { id: 'c1', name: 'Иванов' },
    { id: 'c2', name: 'Петров' },
    { id: 'c3', name: 'Сидоров', archived_at: '2026-01-01' },
  ],
  memberships: [
    { client_id: 'c1', start_date: '2026-01-01', end_date: '2026-07-12', total_trainings: 10, used_trainings: 2 },
    { client_id: 'c2', start_date: '2026-01-01', end_date: '2026-06-01', total_trainings: 10, used_trainings: 10 },
  ],
  trainings: [
    { date: '2026-07-11', status: 'completed', client_id: 'c1' },
    { date: '2026-07-11', status: 'completed', client_id: 'c1' },
    { date: '2026-07-10', status: 'completed', client_id: 'c1' },
  ],
  salesReportFilled: false,
})

ok(summary.totalClients === 2, 'archived excluded')
ok(summary.expiring === 1, 'one expiring')
ok(summary.inactive === 1, 'one inactive')
ok(summary.expired_recent === 0, 'c2 end June → not expired_recent')
ok(summary.stale === 1, 'c2 → stale (14–60 days)')
ok(summary.awaiting_start === 0, 'no awaiting_start in fixture')
ok(summary.birthdays === 0, 'no birthdays in fixture')
ok(summary.trainingsToday === 2, 'trainings today')
ok(summary.trainingsYesterday === 1, 'trainings yesterday')
ok(summary.salesReportFilled === false, 'sales not filled')
ok(summary.actionable >= 4, 'actionable: inactive+expiring+stale+sales')

ok(shouldReloadAdminDaySummary({ reason: 'sync-complete' }), 'day summary: sync-complete')
ok(shouldReloadAdminDaySummary({ reason: 'admin-clients-cache' }), 'day summary: admin-clients-cache')
ok(!shouldReloadAdminDaySummary({}), 'day summary: ignore empty reason')
ok(!shouldReloadAdminDaySummary({ reason: 'exercises' }), 'day summary: ignore exercises')
ok(!shouldReloadAdminDaySummary({ reason: 'membership-types' }), 'day summary: ignore membership-types')
ok(!shouldReloadAdminDaySummary({ reason: 'sync-queue' }), 'day summary: ignore sync-queue')

const withOverrides = buildAdminClubDaySummary({
  today: '2026-07-11',
  yesterday: '2026-07-10',
  clients: [],
  memberships: [],
  trainings: [],
  inactiveOverride: 11,
  trainingsTodayOverride: 10,
  trainingsYesterdayOverride: 4,
})
ok(withOverrides.inactive === 11 && withOverrides.trainingsToday === 10 && withOverrides.trainingsYesterday === 4, 'summary overrides')

if (failed) process.exit(1)
console.log('verify-admin-club-day-summary: all passed')
