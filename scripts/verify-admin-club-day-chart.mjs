import {
  averageCompleted,
  buildAdminClubDayChartSeries,
  formatDayAxisLabel,
  isWeekendIsoDate,
} from '../src/lib/admin/adminClubDayChartCore.js'
import { mergeWeekendRuns } from '../src/lib/admin/adminClubDayChartBandsPlugin.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

ok(formatDayAxisLabel('2026-11-06') === '06.11', 'axis label')
ok(formatDayAxisLabel('bad') === 'bad', 'axis fallback')

ok(isWeekendIsoDate('2026-11-07') === true, 'sat')
ok(isWeekendIsoDate('2026-11-08') === true, 'sun')
ok(isWeekendIsoDate('2026-11-06') === false, 'thu')
ok(isWeekendIsoDate('') === false, 'empty weekend')

ok(averageCompleted([]) === null, 'avg empty')
ok(averageCompleted([10, 20, 30]) === 20, 'avg int')
ok(averageCompleted([11, 12]) === 11.5, 'avg half')

const empty = buildAdminClubDayChartSeries([])
ok(empty.pointCount === 0 && empty.hasDraft === false && empty.avgCompleted === null, 'empty')

const series = buildAdminClubDayChartSeries(
  [
    { date: '2026-11-01', completed: 11, draft: 0 },
    { date: '2026-11-07', completed: 20, draft: 0 },
    { date: '2026-11-10', completed: 40, draft: 3 },
    { date: '', completed: 9 },
  ],
  { todayIso: '2026-11-10' },
)
ok(series.pointCount === 3, 'skip empty date')
ok(series.labels[0] === '01.11' && series.labels[1] === '07.11', 'labels')
ok(series.completed[0] === 11 && series.completed[2] === 40, 'completed')
ok(series.draft[2] === 3 && series.hasDraft === true, 'draft')
ok(series.avgCompleted === 23.7, `avg got ${series.avgCompleted}`)
ok(series.dayFlags[0].weekend === true && series.dayFlags[0].today === false, 'nov 1 sun')
ok(series.dayFlags[1].weekend === true, 'nov 7 sat')
ok(series.dayFlags[2].today === true && series.dayFlags[2].weekend === false, 'today tue')

const runs = mergeWeekendRuns([
  { weekend: false },
  { weekend: true },
  { weekend: true },
  { weekend: false },
  { weekend: true },
])
ok(runs.length === 2 && runs[0].start === 1 && runs[0].end === 2 && runs[1].start === 4, 'weekend runs')

console.log('verify-admin-club-day-chart: ok')
