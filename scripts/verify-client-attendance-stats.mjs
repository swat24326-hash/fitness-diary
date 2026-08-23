/**
 * node scripts/verify-client-attendance-stats.mjs
 */
import {
  buildClientAttendanceStats,
  buildAttendanceBucketRanges,
  buildAttendanceChartAxisLabels,
  formatAttendanceBucketDatesCellRu,
  formatBucketLabelRu,
  formatGroupedVisitDatesRu,
  ATTENDANCE_MISSED_LABEL_RU,
  listCompletedVisitDates,
  maxGapDaysBetween,
  maxGapDaysInPeriod,
  resolveAttendanceBucketKind,
  resolveAttendanceRegularity,
  attendanceRegularityLabelRu,
} from '../src/lib/clientAttendanceStatsCore.js'
import {
  earliestCompletedTrainingDate,
  resolveTrainingsCoverageHint,
} from '../src/lib/clientTrainingsCoverageHint.js'
import {
  clientStatsModeNeedsTrainingsEnsure,
  normalizeClientStatsMode,
  resolveClientStatsAllTimeRange,
  shouldForceClientTrainingsEnsureOnReload,
  shouldReloadClientStatsTrainingsLocalOnly,
  shouldReloadTrainerClientStatsForClient,
} from '../src/lib/clientStatsModeCore.js'
import {
  buildClientAttendanceStatsPath,
  normalizeClientCardTab,
  writeClientCardTabToSearchParams,
} from '../src/lib/clientCardTabsCore.js'
import { buildClientCardDeepLink } from '../src/lib/admin/staffTaskDeepLinkCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const T = [
  { id: 'd1', status: 'draft', date: '2026-07-01' },
  { id: 'c1', status: 'completed', date: '2026-07-15' },
  { id: 'c2', status: 'completed', date: '2026-07-15' },
  { id: 'c3', status: 'completed', date: '2026-07-22' },
  { id: 'bz', status: 'completed', date: '2026-06-20', type: 'trial' },
  { id: 'bad', status: 'completed', date: 'invalid' },
]

ok(listCompletedVisitDates(T).length === 4, 'draft and bad date skipped, BZ counted')
ok(listCompletedVisitDates(T).filter((v) => v.date === '2026-07-15').length === 2, 'two visits same day')

const empty = buildClientAttendanceStats(T, { dateFrom: '2026-08-01', dateTo: '2026-08-31' })
ok(empty.summary.total === 0 && empty.summary.regularity === 'none', 'no visits in range')

const weekStats = buildClientAttendanceStats(T, { dateFrom: '2026-07-01', dateTo: '2026-07-31' })
ok(weekStats.summary.total === 3, 'three visits in july range')
ok(weekStats.bucketKind === 'week', 'july range uses week buckets')
ok(weekStats.buckets.some((b) => b.count === 2), 'week bucket with 2 visits')
ok(weekStats.buckets.some((b) => b.count === 0 && b.visited === false), 'empty week bucket in range')
ok(weekStats.buckets.every((b, i) => b.index === i + 1), 'bucket index sequential')
ok(
  formatAttendanceBucketDatesCellRu([], (d) => d) === ATTENDANCE_MISSED_LABEL_RU,
  'missed cell label',
)
const julyAxis = buildAttendanceChartAxisLabels(weekStats.buckets, 'week')
ok(julyAxis.length === weekStats.buckets.length && julyAxis[0]?.includes('.'), 'chart axis shows week ranges')

const short = buildClientAttendanceStats(T, { dateFrom: '2026-07-14', dateTo: '2026-07-20' })
ok(short.summary.regularity === 'insufficient', 'short period → insufficient label')

const gapTrainings = [
  { id: 'a', status: 'completed', date: '2026-01-01' },
  { id: 'b', status: 'completed', date: '2026-01-20' },
]
ok(maxGapDaysBetween(['2026-01-01', '2026-01-20']) === 19, 'gap 19 days')
const rareStats = buildClientAttendanceStats(gapTrainings, { dateFrom: '2026-01-01', dateTo: '2026-02-28' })
ok(rareStats.summary.regularity === 'rare', 'long gap → rare')

const tailGapTrainings = [
  { id: 'a', status: 'completed', date: '2026-01-05' },
  { id: 'b', status: 'completed', date: '2026-01-10' },
]
const tailStats = buildClientAttendanceStats(tailGapTrainings, {
  dateFrom: '2026-01-01',
  dateTo: '2026-02-28',
})
ok(tailStats.summary.daysSinceLastVisit === 49, 'days since last visit in period')
ok(tailStats.summary.maxGapDays === 49, 'max gap includes tail of period')
ok(tailStats.summary.regularity === 'rare', 'long tail silence → rare')

ok(maxGapDaysInPeriod('2026-01-01', '2026-01-31', ['2026-01-20']) === 19, 'max gap includes lead before first visit')

const longRange = buildClientAttendanceStats(T, { dateFrom: '2026-01-01', dateTo: '2026-08-31' })
ok(longRange.bucketKind === 'month', 'long range → month buckets')

ok(resolveAttendanceBucketKind('2026-01-01', '2026-03-01') === 'month', '61 days → month kind')

const crossYear = formatBucketLabelRu('2025-12-28', '2026-01-03')
ok(crossYear.includes('25') && crossYear.includes('26'), 'cross-year label has both years')

const inverted = buildClientAttendanceStats(T, { dateFrom: '2026-08-01', dateTo: '2026-07-01' })
ok(inverted.summary.total === 0 && inverted.buckets.length === 0, 'inverted range empty')

ok(
  resolveAttendanceRegularity({ visitsPerWeek: 2, maxGapDays: 7, daysSinceLastVisit: 3, total: 8, daysInRange: 30 }) ===
    'regular',
  'regular thresholds',
)
ok(
  resolveAttendanceRegularity({ visitsPerWeek: 1, maxGapDays: 5, daysSinceLastVisit: 20, total: 4, daysInRange: 30 }) ===
    'moderate',
  'tail gap affects moderate via daysSinceLastVisit',
)
ok(attendanceRegularityLabelRu('regular') === 'Регулярно', 'label ru')

ok(buildAttendanceBucketRanges('2026-07-10', '2026-07-10', 'week').length >= 1, 'single-day range has bucket')

const grouped = formatGroupedVisitDatesRu(['2026-07-15', '2026-07-15', '2026-07-22'], (d) => d)
ok(grouped.includes('×2') && grouped.includes('2026-07-22'), 'grouped dates same day')

ok(
  resolveTrainingsCoverageHint({ online: false })?.includes('Офлайн'),
  'offline hint',
)
ok(
  resolveTrainingsCoverageHint({ online: true, ensureOk: false })?.includes('неполн'),
  'ensure fail hint',
)
ok(earliestCompletedTrainingDate(T) === '2026-06-20', 'earliest completed date')
ok(
  resolveTrainingsCoverageHint({
    online: true,
    ensureOk: true,
    earliestLocalCompletedDate: '2026-05-25',
    localCompletedCount: 5,
    todayIso: '2026-08-23',
  })?.includes('90 дней'),
  'journal window edge hint',
)

ok(normalizeClientStatsMode('attendance') === 'attendance', 'stats mode normalize')
ok(clientStatsModeNeedsTrainingsEnsure('measurements') === false, 'measurements skip ensure')
ok(clientStatsModeNeedsTrainingsEnsure('weight') === true, 'weight needs ensure')
ok(
  shouldReloadTrainerClientStatsForClient('c1', { reason: 'training-completed', clientId: 'c2' }) === false,
  'reload scoped to client',
)
ok(shouldForceClientTrainingsEnsureOnReload({ reason: 'sync-complete' }) === true, 'sync forces ensure')
ok(
  shouldForceClientTrainingsEnsureOnReload({ reason: 'client-hydrated' }) === false,
  'hydrate does not force ensure loop',
)
ok(
  shouldReloadClientStatsTrainingsLocalOnly({ reason: 'client-hydrated' }) === true,
  'hydrate reloads local trainings only',
)
ok(
  resolveClientStatsAllTimeRange('attendance', { trainings: [{ status: 'completed', date: '2026-07-01' }] }, '2026-08-01')
    ?.min === '2026-07-01',
  'all-time range from completed',
)
ok(
  listCompletedVisitDates([{ id: '1', status: 'Completed', date: '2026-07-01' }]).length === 1,
  'completed status case-insensitive',
)

ok(normalizeClientCardTab('stats') === 'stats', 'card tab normalize')
const tabQs = new URLSearchParams('club=x')
writeClientCardTabToSearchParams(tabQs, 'stats', { statsMode: 'attendance', clearStatsMode: false })
ok(tabQs.get('tab') === 'stats' && tabQs.get('mode') === 'attendance', 'tab+mode query')
ok(
  buildClientCardDeepLink('abc', { tab: 'stats', mode: 'attendance' }).includes('mode=attendance'),
  'deep link attendance',
)
ok(
  buildClientAttendanceStatsPath('abc', { forAdmin: true }).includes('/admin/clients/abc'),
  'attendance stats path admin',
)

if (failed) process.exit(1)
console.log('verify-client-attendance-stats: all ok')
