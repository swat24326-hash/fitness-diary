import {
  averageMonthlyCount,
  buildAdminClubMonthlyChartModel,
  chartMaxValue,
  currentMonthKeyFromTodayIso,
  monthLabelAxis,
} from '../src/lib/admin/adminClubMonthlyChartCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

ok(chartMaxValue(0) === 5, 'max empty')
ok(chartMaxValue(1016) === 1250, `max 1016 → ${chartMaxValue(1016)}`)
ok(chartMaxValue(1000) === 1000, 'max exact')
ok(chartMaxValue(819) === 1000, `max 819 → ${chartMaxValue(819)}`)

ok(averageMonthlyCount([]) === null, 'avg empty')
ok(averageMonthlyCount([{ count: 0 }, { count: 10 }, { count: 20 }]) === 15, 'avg nonzero')

ok(currentMonthKeyFromTodayIso('2026-11-15') === '2026-11', 'month key')
ok(currentMonthKeyFromTodayIso('bad') === '', 'month bad')

const model = buildAdminClubMonthlyChartModel(
  [
    { month: '2026-05', count: 131 },
    { month: '2026-10', count: 1016 },
    { month: '2026-11', count: 485 },
    { month: '2026-01', count: 0 },
  ],
  { todayIso: '2026-11-15' },
)
ok(model.peakMonth === '2026-10', 'peak')
ok(model.currentMonth === '2026-11', 'current')
ok(model.avgCount === 544, `avg got ${model.avgCount}`)
ok(model.chartMax === 1250, `model max ${model.chartMax}`)
ok(model.avgBottomPct != null && model.avgBottomPct > 40 && model.avgBottomPct < 50, 'avg pct')

ok(monthLabelAxis('2026-10', 2026) === 'октябрь', 'full month')
ok(monthLabelAxis('2025-01', 2026).includes('январ'), 'other year month')

console.log('verify-admin-club-monthly-chart: ok')
