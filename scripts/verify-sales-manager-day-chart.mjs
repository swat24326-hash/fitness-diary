import {
  buildSalesManagerDayChartSeries,
  trimSalesDayChartDatesToToday,
} from '../src/lib/admin/salesManagerDayChartCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

const empty = buildSalesManagerDayChartSeries([], [])
ok(empty.pointCount === 0 && empty.avgTrainings === null && empty.avgPnk === null, 'empty')

const series = buildSalesManagerDayChartSeries(
  [
    { date: '2026-11-01', value: 2, hasReport: true },
    { date: '2026-11-02', value: null, hasReport: false },
    { date: '2026-11-07', value: 1, hasReport: true },
  ],
  [
    { date: '2026-11-01', value: 11, hasReport: true },
    { date: '2026-11-02', value: null, hasReport: false },
    { date: '2026-11-07', value: 20, hasReport: true },
  ],
  { todayIso: '2026-11-07' },
)

ok(series.pointCount === 3, 'points')
ok(series.labels[0] === '01.11' && series.labels[2] === '07.11', 'labels')
ok(series.pnk[0] === 2 && series.trainings[0] === 11, 'day1 values')
ok(series.pnk[1] === null && series.trainings[1] === null, 'no report → null')
ok(series.hasReport[0] === true && series.hasReport[1] === false, 'hasReport flags')
ok(series.dayFlags[2].weekend === true, 'sat flag')
ok(series.dayFlags[2].today === true, 'today flag')
ok(series.avgTrainings === 15.5, 'avg trainings')
ok(series.avgPnk === 1.5, 'avg pnk')
ok(series.reportCount === 2, 'report count')

ok(
  trimSalesDayChartDatesToToday(
    ['2026-11-01', '2026-11-10', '2026-11-20', '2026-11-30'],
    '2026-11-15',
  ).join(',') === '2026-11-01,2026-11-10',
  'trim current month to today',
)
ok(
  trimSalesDayChartDatesToToday(['2026-10-01', '2026-10-31'], '2026-11-15').length === 2,
  'past month not trimmed',
)

const trimmed = buildSalesManagerDayChartSeries(
  [
    { date: '2026-11-01', value: 1, hasReport: true },
    { date: '2026-11-10', value: 2, hasReport: true },
    { date: '2026-11-20', value: 3, hasReport: true },
  ],
  [
    { date: '2026-11-01', value: 10, hasReport: true },
    { date: '2026-11-10', value: 20, hasReport: true },
    { date: '2026-11-20', value: 30, hasReport: true },
  ],
  { todayIso: '2026-11-15' },
)
ok(trimmed.pointCount === 2 && trimmed.dates[1] === '2026-11-10', 'series trimmed to today')

console.log('verify-sales-manager-day-chart: ok')
