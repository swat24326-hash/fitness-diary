/**
 * node scripts/verify-admin-club-day-summary.mjs
 */
import {
  buildAdminClubDaySummary,
  countTrainingsOnDate,
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
ok(summary.trainingsToday === 2, 'trainings today')
ok(summary.trainingsYesterday === 1, 'trainings yesterday')
ok(summary.salesReportFilled === false, 'sales not filled')
ok(summary.actionable >= 3, 'actionable includes sales gap')

if (failed) process.exit(1)
console.log('verify-admin-club-day-summary: all passed')
