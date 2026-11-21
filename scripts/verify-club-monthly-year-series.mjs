/**
 * node scripts/verify-club-monthly-year-series.mjs
 */
import {
  resolveMonthSeriesAsOf,
  aggregateMonthlyAttendanceSeries,
  aggregateMonthlyRetentionM3Series,
  clubMonthlySeriesDisplayValue,
  formatClubMonthlySeriesValue,
  pickClubMonthlySeries,
  volumeRowsToSeries,
} from '../src/lib/admin/clubMonthlyYearSeriesCore.js'
import { buildAdminClubMonthlyChartModel } from '../src/lib/admin/adminClubMonthlyChartCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(resolveMonthSeriesAsOf('2026-05', '2026-11-15') === '2026-05-31', 'past month end')
ok(resolveMonthSeriesAsOf('2026-11', '2026-11-15') === '2026-11-15', 'current month today')
ok(resolveMonthSeriesAsOf('2026-12', '2026-11-15') === null, 'future month null')

const clients = [
  {
    id: 'c1',
    name: 'Аня',
    trainer_id: 't1',
    archived_at: null,
    lifecycle: null,
    desk_hall: null,
  },
]
const memberships = [
  {
    id: 'm1',
    client_id: 'c1',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    total_trainings: 36,
    used_trainings: 10,
    membership_type_id: 'type-pz',
    hall: 'pz',
  },
]
const membershipTypes = [
  { id: 'type-pz', code: 'pz', is_pnk_trial: false, trainer_assignable: true },
]

/** Визиты примерно 2/нед в окне мая */
const trainings = []
for (let d = 1; d <= 31; d += 3) {
  trainings.push({
    id: `tr-may-${d}`,
    client_id: 'c1',
    trainer_id: 't1',
    date: `2026-05-${String(d).padStart(2, '0')}`,
    status: 'completed',
  })
}

const attendance = aggregateMonthlyAttendanceSeries({
  clients,
  memberships,
  trainings,
  membershipTypes,
  lifecycleRows: [],
  year: 2026,
  todayIso: '2026-11-15',
})
const mayAtt = attendance.find((r) => r.month === '2026-05')
ok(mayAtt && mayAtt.value != null && mayAtt.value > 0, `may attendance value=${mayAtt?.value}`)
const decAtt = attendance.find((r) => r.month === '2026-12')
ok(decAtt && decAtt.value == null, 'future dec attendance null')

/** Когорта январь 2026 → M+3 = апрель 2026: один визит в апреле */
const retentionClients = [
  {
    id: 'c2',
    name: 'Боря',
    trainer_id: 't1',
    archived_at: null,
    lifecycle: null,
    desk_hall: null,
  },
]
const retentionMems = [
  {
    id: 'm2',
    client_id: 'c2',
    start_date: '2026-01-10',
    end_date: '2026-04-10',
    total_trainings: 12,
    used_trainings: 4,
    membership_type_id: 'type-pz',
    hall: 'pz',
  },
]
const retentionTrainings = [
  { id: 'r1', client_id: 'c2', trainer_id: 't1', date: '2026-01-12', status: 'completed' },
  { id: 'r2', client_id: 'c2', trainer_id: 't1', date: '2026-04-05', status: 'completed' },
]

const m3 = aggregateMonthlyRetentionM3Series({
  clients: retentionClients,
  memberships: retentionMems,
  trainings: retentionTrainings,
  membershipTypes,
  lifecycleRows: [],
  year: 2026,
  todayIso: '2026-11-15',
})
const apr = m3.find((r) => r.month === '2026-04')
ok(apr && apr.value != null && apr.value > 0, `apr M3 value=${apr?.value}`)

ok(clubMonthlySeriesDisplayValue('retentionM3', 0.655) === 65.5, 'display pct')
ok(formatClubMonthlySeriesValue('retentionM3', 65.5) === '66%', 'format pct round')
ok(formatClubMonthlySeriesValue('attendance', 1.25) === '1,25' || formatClubMonthlySeriesValue('attendance', 1.25).includes('1'), 'format att')

const picked = pickClubMonthlySeries('volume', {
  months: [
    { month: '2026-01', count: 3 },
    { month: '2026-02', count: 0 },
  ],
})
ok(picked[0].value === 3, 'volume pick')
ok(volumeRowsToSeries([{ month: '2026-01', count: 7 }])[0].value === 7, 'volume rows')

const model = buildAdminClubMonthlyChartModel(
  [
    { month: '2026-05', value: 40 },
    { month: '2026-06', value: 80 },
    { month: '2026-07', value: null },
  ],
  { todayIso: '2026-11-15', includeZeroInAvg: true, forceMax: 100 },
)
ok(model.chartMax === 100, `forceMax got ${model.chartMax}`)
ok(model.avgCount === 60, `avg with null skip got ${model.avgCount}`)
ok(model.peakMonth === '2026-06', 'peak')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nverify-club-monthly-year-series: ok')
