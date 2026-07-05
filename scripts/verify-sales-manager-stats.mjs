import {
  buildSalesManagerMonthStats,
  buildDailyProfitSeries,
  sumMatrix3x3FromDailyRows,
} from '../src/lib/admin/salesManagerStatsAgg.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const rows = [
  {
    report_date: '2026-06-01',
    profit_nk: 100000,
    profit_dk: 50000,
    profit_uk: 10000,
    profit_day: 160000,
    pnk_total: 3,
    trainings_count: 12,
    pz_nk: 2,
    tz_nk: 1,
    az_nk: 0,
    pz_dk: 1,
    tz_dk: 0,
    az_dk: 0,
    pz_uk: 0,
    tz_uk: 0,
    az_uk: 0,
  },
  {
    report_date: '2026-06-03',
    profit_nk: 80000,
    profit_dk: 20000,
    profit_uk: 0,
    profit_day: 100000,
    pnk_total: 1,
    trainings_count: 8,
    pz_nk: 1,
    tz_nk: 0,
    az_nk: 0,
    pz_dk: 0,
    tz_dk: 0,
    az_dk: 0,
    pz_uk: 0,
    tz_uk: 0,
    az_uk: 0,
  },
]

const stats = buildSalesManagerMonthStats({
  monthRows: rows,
  planLevels: { level1: 1_000_000, level2: 1_100_000, level3: 1_200_000 },
  year: 2026,
  month: 6,
})

ok(stats.summary.profitTotal === 260000, 'month profit total')
ok(stats.summary.pnkTotal === 4, 'pnk total')
ok(stats.summary.dayCount === 2, 'reported days count')
ok(stats.summary.daysInMonth === 30, 'days in june')
ok(stats.plan.achievedLevel === 0, 'level 0 below 1M')
ok(stats.dailySeries.length === 30, 'full month series')
ok(stats.dailySeries[0].profit === 160000, 'day 1 profit')
ok(stats.dailySeries[1].profit === null && !stats.dailySeries[1].hasReport, 'day 2 empty')
ok(stats.dayTable.length === 2, 'day table rows')
ok(sumMatrix3x3FromDailyRows(rows).pz_nk === 3, 'matrix cell sum')

const series = buildDailyProfitSeries(rows, 2026, 6)
ok(series.filter((d) => d.hasReport).length === 2, 'series reported count')

process.exit(failed > 0 ? 1 : 0)
