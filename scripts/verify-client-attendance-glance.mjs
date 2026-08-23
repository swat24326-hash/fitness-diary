/**
 * node scripts/verify-client-attendance-glance.mjs
 */
import { buildClientAttendanceStats } from '../src/lib/clientAttendanceStatsCore.js'
import { buildClientAttendanceAssessment, ATTENDANCE_TARGET_VISITS_PER_WEEK } from '../src/lib/clientAttendanceAssessmentCore.js'
import {
  ATTENDANCE_SLIP_DAYS_THRESHOLD,
  buildClientAttendanceGlance,
  buildMembershipAttendancePace,
  formatTrainingsCountRu,
  isClientAttendanceSlip,
  maxConsecutiveMissedBuckets,
  hasTornRhythmInLastWeekBuckets,
  tornRhythmLabelRu,
  resolveAttendanceTargetVisitsPerWeek,
  resolveAttendanceTrendFromBuckets,
  attendanceTrendLabelRu,
} from '../src/lib/clientAttendanceGlanceCore.js'
import { pickUsableMembershipForDate } from '../src/lib/membershipRules.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(formatTrainingsCountRu(1) === '1 тренировка', 'count ru 1')
ok(formatTrainingsCountRu(5) === '5 тренировок', 'count ru 5')

const mem = {
  id: 'm1',
  start_date: '2026-07-01',
  end_date: '2026-08-31',
  total_trainings: 16,
  used_trainings: 0,
  membership_type_id: 't1',
}
ok(resolveAttendanceTargetVisitsPerWeek(mem) === 1.8, 'target from abon ~1.8/wk')

const trainings = [
  { id: '1', status: 'completed', date: '2026-08-01', client_id: 'c1' },
  { id: '2', status: 'completed', date: '2026-08-10', client_id: 'c1' },
]

ok(
  isClientAttendanceSlip({
    client: { id: 'c1' },
    memList: [mem],
    today: '2026-08-23',
    trainings,
    hallMode: 'pz',
  }) === false,
  'active abon recent visit not slip',
)

ok(
  isClientAttendanceSlip({
    client: { id: 'c1' },
    memList: [mem],
    today: '2026-08-23',
    lastTrainingIso: '2026-08-01',
    trainings: [],
    hallMode: 'pz',
  }) === true,
  '14+ days since visit is slip',
)

ok(
  isClientAttendanceSlip({
    client: { id: 'c1', lifecycle: 'pnk' },
    memList: [mem],
    today: '2026-08-23',
    lastTrainingIso: '2026-01-01',
    hallMode: 'pz',
  }) === false,
  'pnk excluded',
)

const stats = buildClientAttendanceStats(trainings, { dateFrom: '2026-08-01', dateTo: '2026-08-23' })
const assessment = buildClientAttendanceAssessment(stats, {
  dateFrom: '2026-08-01',
  dateTo: '2026-07-31',
  todayIso: '2026-08-23',
  dataReliable: false,
  coverageHint: 'Тест: неполный дневник',
  memberships: [mem],
  allTrainings: trainings,
})
ok(assessment.disclaimerRu === 'Тест: неполный дневник', 'assessment uses coverage hint')
ok(assessment.todayLineRu?.includes('Сейчас'), 'assessment today line when period ends before today')
ok(assessment.periodLabelRu.includes('2026'), 'period label')

const trendTrainings = [
  { id: 'w1a', status: 'completed', date: '2026-06-02' },
  { id: 'w1b', status: 'completed', date: '2026-06-04' },
  { id: 'w2a', status: 'completed', date: '2026-06-10' },
  { id: 'w2b', status: 'completed', date: '2026-06-11' },
  { id: 'w3a', status: 'completed', date: '2026-06-18' },
  { id: 'w3b', status: 'completed', date: '2026-06-19' },
  { id: 'w4a', status: 'completed', date: '2026-06-25' },
  { id: 'w4b', status: 'completed', date: '2026-06-26' },
  { id: 'tail', status: 'completed', date: '2026-07-28' },
]
const weekStats = buildClientAttendanceStats(trendTrainings, { dateFrom: '2026-06-01', dateTo: '2026-07-31' })
ok(resolveAttendanceTrendFromBuckets(weekStats.buckets, 'week') === 'slipping', 'trend slipping')

ok(maxConsecutiveMissedBuckets([{ count: 2 }, { count: 0 }, { count: 0 }, { count: 1 }]) === 2, 'max consecutive miss 2')
ok(attendanceTrendLabelRu('stable') === 'Ровный объём', 'stable label means volume not rhythm')

// Ровный объём, но пауза 3 недели подряд → фактор trend не «зелёный ритм»
const gappy = []
for (let i = 0; i < 8; i++) {
  const d0 = 1 + i * 7
  const iso = `2026-06-${String(Math.min(d0, 28)).padStart(2, '0')}`
  if (i === 2 || i === 3 || i === 4) continue // 3 missed weeks in middle of window if we only add visits elsewhere
  gappy.push({ id: `g${i}a`, status: 'completed', date: iso })
  gappy.push({ id: `g${i}b`, status: 'completed', date: iso })
}
// Better: build buckets manually via stats over known range with explicit gaps
const gapTrainings = [
  { id: 'a1', status: 'completed', date: '2026-06-02' },
  { id: 'a2', status: 'completed', date: '2026-06-04' },
  { id: 'b1', status: 'completed', date: '2026-06-09' },
  { id: 'b2', status: 'completed', date: '2026-06-11' },
  // 3 empty weeks mid-June → early July
  { id: 'c1', status: 'completed', date: '2026-07-07' },
  { id: 'c2', status: 'completed', date: '2026-07-09' },
  { id: 'd1', status: 'completed', date: '2026-07-14' },
  { id: 'd2', status: 'completed', date: '2026-07-16' },
  { id: 'e1', status: 'completed', date: '2026-07-21' },
  { id: 'e2', status: 'completed', date: '2026-07-23' },
  { id: 'f1', status: 'completed', date: '2026-07-28' },
  { id: 'f2', status: 'completed', date: '2026-07-30' },
]
const gapStats = buildClientAttendanceStats(gapTrainings, { dateFrom: '2026-06-01', dateTo: '2026-07-31' })
ok(maxConsecutiveMissedBuckets(gapStats.buckets) >= 2, 'fixture has multi-week gap')
const gapAssessment = buildClientAttendanceAssessment(gapStats, {
  dateFrom: '2026-06-01',
  dateTo: '2026-07-31',
  todayIso: '2026-07-31',
  dataReliable: true,
})
const trendFactor = gapAssessment.factors.find((f) => f.key === 'trend')
ok(
  trendFactor?.tone === 'warn' && /разорван/i.test(trendFactor.labelRu ?? ''),
  'gappy weeks → torn rhythm warn (any trend)',
)
ok(
  !trendFactor || trendFactor.tone !== 'good' || !/ровн\w+ (ритм|объём)/i.test(trendFactor.labelRu ?? ''),
  'torn never green flat rhythm/volume copy',
)

// Две разные пустые недели в последних 8 — не «ровный ритм»
const splitGapTrainings = [
  { id: 's1', status: 'completed', date: '2026-06-02' },
  { id: 's2', status: 'completed', date: '2026-06-04' },
  { id: 's3', status: 'completed', date: '2026-06-30' },
  { id: 's4', status: 'completed', date: '2026-07-02' },
  { id: 's5', status: 'completed', date: '2026-07-07' },
  { id: 's6', status: 'completed', date: '2026-07-09' },
  { id: 's7', status: 'completed', date: '2026-07-16' },
  { id: 's8', status: 'completed', date: '2026-07-28' },
  { id: 's9', status: 'completed', date: '2026-07-30' },
  { id: 's10', status: 'completed', date: '2026-08-04' },
  { id: 's11', status: 'completed', date: '2026-08-06' },
  { id: 's12', status: 'completed', date: '2026-08-10' },
]
const splitGapStats = buildClientAttendanceStats(splitGapTrainings, { dateFrom: '2026-05-26', dateTo: '2026-08-10' })
const splitLast8 = splitGapStats.buckets.slice(-8)
ok(hasTornRhythmInLastWeekBuckets(splitLast8, 'week', 8), 'two empty weeks in last 8 → torn')
ok(/разорван/i.test(tornRhythmLabelRu(splitLast8, 'week', 8) ?? ''), 'torn rhythm label ru')
const splitAssessment = buildClientAttendanceAssessment(splitGapStats, {
  dateFrom: '2026-05-26',
  dateTo: '2026-08-10',
  todayIso: '2026-08-10',
  dataReliable: true,
})
const splitTrendFactor = splitAssessment.factors.find((f) => f.key === 'trend')
ok(
  splitTrendFactor?.tone === 'warn' && /разорван/i.test(splitTrendFactor.labelRu ?? ''),
  'two missed weeks in last 8 is not green flat rhythm',
)

const pace = buildMembershipAttendancePace(mem, trainings, '2026-08-23', 2)
ok(pace && pace.used === 2, 'membership pace used count')

const glance = buildClientAttendanceGlance({ client: { id: 'c1' }, memList: [mem], trainings, today: '2026-08-23' })
ok(glance?.chipLabelRu.includes('·'), 'glance chip label')

const slipGlance = buildClientAttendanceGlance({
  client: { id: 'c1' },
  memList: [mem],
  trainings: [{ id: 'old', status: 'completed', date: '2026-07-01' }],
  today: '2026-08-23',
})
ok(slipGlance?.slip === true && /^Пауза ·/.test(slipGlance.chipLabelRu ?? ''), 'slip chip says Пауза not Норма')

ok(
  isClientAttendanceSlip({
    client: { id: 'c1' },
    memList: [mem],
    today: '2026-08-23',
    hallMode: 'pz',
  }) === false,
  'unknown last training is not slip',
)
ok(
  isClientAttendanceSlip({
    client: { id: 'c1' },
    memList: [mem],
    today: '2026-08-23',
    hallMode: 'pz',
    lastTrainingIso: '',
  }) === true,
  'known empty last training is slip',
)

const noneStats = buildClientAttendanceStats([], { dateFrom: '2026-06-01', dateTo: '2026-07-31' })
const noneAssessment = buildClientAttendanceAssessment(noneStats, {
  dateFrom: '2026-06-01',
  dateTo: '2026-07-31',
  todayIso: '2026-07-31',
})
ok(noneAssessment.trendLabelRu == null, 'none regularity → no trend label')

ok(
  resolveAttendanceTrendFromBuckets(
    Array.from({ length: 8 }, () => ({ count: 0 })),
    'week',
  ) === null,
  'all-zero weeks → no volume trend',
)

ok(ATTENDANCE_SLIP_DAYS_THRESHOLD === 14, 'slip threshold')
ok(ATTENDANCE_TARGET_VISITS_PER_WEEK === 2, 'default target')
ok(pickUsableMembershipForDate([mem], '2026-08-15')?.id === 'm1', 'usable mem fixture')

if (failed) process.exit(1)
console.log('verify-client-attendance-glance: all ok')
