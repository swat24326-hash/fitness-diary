import {
  buildSalesManagerMonthStats,
  buildDailyProfitSeries,
  buildDailyCountSeries,
  aggregateTrainingsByMembershipTypes,
  sumMatrix3x3FromDailyRows,
} from '../src/lib/admin/salesManagerStatsAgg.js'
import { SALES_MONTH_DAILY_SELECT, planProgressPercent } from '../src/lib/admin/salesReportCore.js'

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
    profit_day: 164000,
    pnk_total: 3,
    trainings_count: 12,
    trainings_matrix: [{ trainer_id: '__club__', membership_type_id: 't1', count: 5 }],
    matrix_amounts: { pz_nk: 80000, tz_dk: 40000, dop_total: 4000 },
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
  planDirections: { plan_pz: 500_000, plan_tz: 400_000, plan_az: 200_000, plan_extra: 100_000 },
  membershipTypes: [{ id: 't1', code: 'NK', trainer_pay_per_session: 200, trainer_assignable: true }],
  year: 2026,
  month: 6,
})

ok(stats.summary.trainerPayroll === 1000, 'month trainer payroll from matrix')

ok(stats.summary.profitTotal === 264000, 'month profit total includes dop net of refunds')
ok(stats.structure.some((s) => s.key === 'dop' && s.amount === 4000), 'dop in category structure')
ok(stats.directionStructure.find((s) => s.key === 'extra')?.planProgressPercent === 4, 'dop plan progress')
ok(stats.directionStructure.find((s) => s.key === 'pz')?.amount === 80000, 'pz fact from matrix amounts')
ok(stats.hallFinance?.pz?.netProfit === 80000 - 1000, 'pz net profit revenue minus payroll')
ok(stats.hallFinance?.tz?.revenue === 40000, 'tz revenue from matrix amounts')
ok(stats.hallFinance?.az?.netProfit === stats.hallFinance?.az?.revenue - (stats.summary.aerobicPayroll ?? 0), 'az net profit')
ok(stats.aerobicStats?.total === 0, 'aerobic stats total from matrix')
ok(stats.summary.pnkTotal === 4, 'pnk total')
ok(stats.summary.dayCount === 2, 'reported days count')
ok(stats.summary.daysInMonth === 30, 'days in june')
ok(stats.plan.achievedLevel === 0, 'level 0 below 1M')

const statsWithRefunds = buildSalesManagerMonthStats({
  monthRows: [
    {
      report_date: '2026-06-01',
      profit_nk: 555,
      profit_dk: 0,
      profit_uk: 0,
      matrix_amounts: { pz_uk: 555 },
      refunds_amount: 500000,
      trainings_count: 0,
      pnk_total: 0,
    },
  ],
  planLevels: { level1: 1_100_000, level2: 1_200_000, level3: 1_300_000 },
  planDirections: { plan_pz: 500_000, plan_tz: 400_000, plan_az: 300_000, plan_extra: 100_000 },
  membershipTypes: [],
  year: 2026,
  month: 6,
})
ok(statsWithRefunds.summary.profitGrossTotal === 555, 'refunds row gross unchanged')
ok(statsWithRefunds.summary.profitTotal === 555 - 500000, 'refunds row net after refunds')
ok(statsWithRefunds.plan.progressPercent === planProgressPercent(555, 1_300_000), 'plan progress from gross not net')
ok(statsWithRefunds.plan.progressPercent !== planProgressPercent(555 - 500000, 1_300_000), 'plan ignores refunds')
ok(stats.dailySeries.length === 30, 'full month series')
ok(stats.dailySeries[0].profit === 164000, 'day 1 profit includes dop')
ok(stats.dailySeries[1].profit === null && !stats.dailySeries[1].hasReport, 'day 2 empty')
ok(stats.dayTable.length === 2, 'day table rows')
ok(sumMatrix3x3FromDailyRows(rows).pz_nk === 3, 'matrix cell sum')
ok(SALES_MONTH_DAILY_SELECT.includes('pz_nk'), 'month daily select includes matrix counts')

const pnkSeries = buildDailyCountSeries(rows, 2026, 6, 'pnk_total')
ok(pnkSeries[0].value === 3, 'pnk day 1 from month rows')

const trainingsAgg = aggregateTrainingsByMembershipTypes(rows, [{ id: 't1', code: 'NK' }])
ok(trainingsAgg.byType.some((x) => x.count === 5), 'trainings by type from matrix')

const series = buildDailyProfitSeries(rows, 2026, 6)
ok(series.filter((d) => d.hasReport).length === 2, 'series reported count')

process.exit(failed > 0 ? 1 : 0)
