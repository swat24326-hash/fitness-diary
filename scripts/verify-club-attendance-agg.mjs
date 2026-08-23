/**
 * node scripts/verify-club-attendance-agg.mjs
 */
import {
  aggregateClubAttendance,
  clubAttendanceExactWeekDivisor,
  formatClubAttendancePct,
  formatClubAvgVisitsPerWeek,
  meanOfNumbers,
  medianOfNumbers,
  isClubAttendancePayloadIncomplete,
  preferClubAttendancePayload,
} from '../src/lib/admin/clubAttendanceAggCore.js'
import { isClientAttendanceSlip } from '../src/lib/clientAttendanceGlanceCore.js'
import { daysInIsoRangeInclusive } from '../src/lib/clientAttendanceStatsCore.js'
import { pickUsableMembershipForDate } from '../src/lib/membershipRules.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-08-23'
const memActive = {
  id: 'm1',
  client_id: 'c1',
  start_date: '2026-07-01',
  end_date: '2026-09-30',
  total_trainings: 24,
  used_trainings: 2,
}

const clients = [
  { id: 'c1', name: 'Иванов', trainer_id: 't1', lifecycle: null },
  { id: 'c2', name: 'Петров', trainer_id: 't1', lifecycle: null },
  { id: 'c3', name: 'ПНК', trainer_id: 't1', lifecycle: 'pnk' },
  { id: 'c4', name: 'Без абона', trainer_id: 't1', lifecycle: null },
]

const memberships = [
  memActive,
  {
    id: 'm2',
    client_id: 'c2',
    start_date: '2026-07-01',
    end_date: '2026-09-30',
    total_trainings: 24,
    used_trainings: 1,
  },
]

const trainings = [
  { id: 'tr1', client_id: 'c1', status: 'completed', date: '2026-08-20' },
  { id: 'tr2', client_id: 'c1', status: 'completed', date: '2026-08-22' },
  // c2 last visit long ago → slip (outside 30d window → 0 visits/week in window)
  { id: 'tr3', client_id: 'c2', status: 'completed', date: '2026-07-01' },
]

ok(Math.abs(clubAttendanceExactWeekDivisor(30) - 30 / 7) < 1e-12, 'exact week divisor 30/7')
ok(clubAttendanceExactWeekDivisor(30) < 5, 'exact divisor below old ceil(30/7)=5')

const empty = aggregateClubAttendance({})
ok(empty.poolSize === 0 && empty.inRhythmPct == null && empty.avgVisitsPerWeek == null, 'empty input')

const agg = aggregateClubAttendance({
  clients,
  memberships,
  trainings,
  dateTo: today,
  clampAsOf: false,
})

ok(agg.poolSize === 2, 'pool = usable abon, not pnk, not without mem')
ok(agg.slippedCount === 1, 'one slipped')
ok(agg.inRhythmCount === 1, 'one in rhythm')
ok(agg.inRhythmPct === 50, 'pct = 50')
ok(formatClubAttendancePct(agg.inRhythmPct) === '50%', 'format pct')
ok(agg.slippedPreview.some((r) => r.clientId === 'c2'), 'preview has slipped client')
ok(agg.windowDays === 30, 'window is 30 inclusive days')
ok(agg.totalVisitsInWindow === 2, 'only completed in window (c1×2)')

const expectedAvg = (2 / 2) * (7 / 30) // total/pool * 7/days
ok(Math.abs(agg.avgVisitsPerWeek - expectedAvg) < 1e-12, 'avg = visits/pool × 7/days (exact)')
ok(Math.abs(agg.avgVisitsPerWeek - 0.2) > 1e-6, 'avg is not old ceil formula 0.2')
ok(Math.abs(agg.medianVisitsPerWeek - expectedAvg) < 1e-12, 'median of [0, 2×7/30] = club avg')
ok(Math.abs(agg.byTrainer[0].avgVisitsPerWeek - expectedAvg) < 1e-12, 'trainer avg matches club')
ok(formatClubAvgVisitsPerWeek(agg.avgVisitsPerWeek) === Number(agg.avgVisitsPerWeek).toFixed(2), 'format avg number only')
ok(formatClubAvgVisitsPerWeek(1.234) === '1.23', 'format avg two decimals')
ok(meanOfNumbers([1, 2, 3]) === 2, 'meanOfNumbers')
ok(medianOfNumbers([1, 2, 3, 4]) === 2.5, 'medianOfNumbers even')
ok(!isClubAttendancePayloadIncomplete(agg), 'fresh agg complete')
ok(isClubAttendancePayloadIncomplete(null), 'null incomplete')
ok(
  !isClubAttendancePayloadIncomplete({
    poolSize: 10,
    avgVisitsPerWeek: 0,
    totalVisitsInWindow: 0,
    byRegularity: {},
    byTrainer: [],
  }),
  'honest zero visits is complete',
)
ok(
  isClubAttendancePayloadIncomplete({
    poolSize: 10,
    avgVisitsPerWeek: 0,
    totalVisitsInWindow: 0,
    byRegularity: {},
    byTrainer: [],
    visitsDataMissing: true,
  }),
  'visitsDataMissing → incomplete',
)
ok(
  isClubAttendancePayloadIncomplete({
    poolSize: 10,
    avgVisitsPerWeek: 1.2,
    totalVisitsInWindow: 20,
    byRegularity: {},
    byTrainer: [],
    truncated: true,
  }),
  'truncated → incomplete',
)
ok(
  !isClubAttendancePayloadIncomplete({
    poolSize: 10,
    avgVisitsPerWeek: 1.03,
    totalVisitsInWindow: 50,
    byRegularity: {},
    byTrainer: [],
  }),
  'healthy payload complete',
)
ok(
  preferClubAttendancePayload(
    { poolSize: 2, avgVisitsPerWeek: 0, totalVisitsInWindow: 0, byRegularity: {}, byTrainer: [] },
    agg,
  )?.avgVisitsPerWeek === agg.avgVisitsPerWeek,
  'prefer richer local when both complete',
)
ok(
  preferClubAttendancePayload(
    {
      poolSize: 2,
      avgVisitsPerWeek: 0.5,
      totalVisitsInWindow: 2,
      byRegularity: {},
      byTrainer: [],
      truncated: true,
    },
    { ...agg, totalVisitsInWindow: Math.max(20, Number(agg.totalVisitsInWindow) || 0) },
  )?.totalVisitsInWindow >= 20,
  'prefer local over truncated api',
)

// exact-week regularity vs client ceil: 7 visits / 30d ≈ 1.63 → Регулярно
const exactReg = aggregateClubAttendance({
  clients: [{ id: 'c1', name: 'A', trainer_id: 't1', lifecycle: null }],
  memberships: [memActive],
  trainings: [
    { id: 'r1', client_id: 'c1', status: 'completed', date: '2026-07-26' },
    { id: 'r2', client_id: 'c1', status: 'completed', date: '2026-07-29' },
    { id: 'r3', client_id: 'c1', status: 'completed', date: '2026-08-01' },
    { id: 'r4', client_id: 'c1', status: 'completed', date: '2026-08-04' },
    { id: 'r5', client_id: 'c1', status: 'completed', date: '2026-08-08' },
    { id: 'r6', client_id: 'c1', status: 'completed', date: '2026-08-12' },
    { id: 'r7', client_id: 'c1', status: 'completed', date: '2026-08-20' },
  ],
  dateTo: today,
  clampAsOf: false,
})
ok(exactReg.byRegularity?.regular === 1, 'club regularity uses exact weeks (≥1.5)')

// 2 completed same day count as 2 trainings
const sameDay = aggregateClubAttendance({
  clients: [{ id: 'c1', name: 'A', trainer_id: 't1', lifecycle: null }],
  memberships: [memActive],
  trainings: [
    { id: 'a', client_id: 'c1', status: 'completed', date: '2026-08-20' },
    { id: 'b', client_id: 'c1', status: 'completed', date: '2026-08-20' },
    { id: 'c', client_id: 'c1', status: 'draft', date: '2026-08-21' },
  ],
  dateTo: today,
  clampAsOf: false,
})
ok(sameDay.totalVisitsInWindow === 2, 'same-day completed count as 2; draft ignored')
ok(Math.abs(sameDay.avgVisitsPerWeek - (2 * 7) / 30) < 1e-12, 'same-day avg exact')

// parity with isClientAttendanceSlip
let slipN = 0
for (const c of clients) {
  if (String(c.lifecycle) === 'pnk') continue
  const memList = memberships.filter((m) => m.client_id === c.id)
  if (!pickUsableMembershipForDate(memList, today)) continue
  const tr = trainings.filter((t) => t.client_id === c.id)
  if (isClientAttendanceSlip({ client: c, memList, today, trainings: tr, hallMode: 'pz' })) slipN++
}
ok(slipN === agg.slippedCount, 'parity slipped count with filter rule')

const scoped = aggregateClubAttendance({
  clients,
  memberships,
  trainings,
  dateTo: today,
  trainerIdFilter: 't2',
  clampAsOf: false,
})
ok(scoped.poolSize === 0, 'trainer filter empty')

const shortPeriodSafe = aggregateClubAttendance({
  clients,
  memberships,
  trainings,
  dateTo: today,
  clampAsOf: false,
})
ok(shortPeriodSafe.inRhythmPct != null && shortPeriodSafe.poolSize > 0, 'asOf window works without long period')

const futureAsOf = aggregateClubAttendance({
  clients,
  memberships,
  trainings,
  dateTo: '2099-01-01',
})
ok(futureAsOf.asOf !== '2099-01-01', 'future dateTo clamped to today')

const daysCheck = daysInIsoRangeInclusive('2026-07-25', '2026-08-23')
ok(daysCheck === 30, 'inclusive 30-day window helper')

if (failed) process.exit(1)
console.log('verify-club-attendance-agg: all ok')
