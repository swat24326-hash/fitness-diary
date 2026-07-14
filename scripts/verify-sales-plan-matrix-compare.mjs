import {
  buildPlanMatrixComparison,
  buildPlanMatrixCellDailySeries,
  buildSegmentDailyComparableSeries,
  resolvePlanMatrixCellStatus,
  forecastPlanMatrixAmount,
  forecastPlanMatrixCount,
} from '../src/lib/admin/salesPlanMatrixCompare.js'
import {
  evaluatePlanDirectionsForm,
  planFormToPayload,
} from '../src/lib/admin/salesReportCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const matrixBase = {
  plan_level_1: '1000000',
  plan_level_2: '1100000',
  plan_level_3: '1200000',
  plan_pz_nk_count: '100',
  plan_pz_nk_avg: '3000',
  plan_tz_nk_count: '100',
  plan_tz_nk_avg: '3000',
  plan_az_nk_count: '100',
  plan_az_nk_avg: '3000',
  plan_extra: '300000',
}

const parsed = planFormToPayload(matrixBase)
ok(parsed.ok === true, 'plan payload ok when matrix meets final')
ok(parsed.payload.plan_total === 1200000, 'plan_total stored as level 3')
ok(parsed.payload.plan_matrix?.pz_nk?.count === 100, 'plan_matrix saved')

const surplus = planFormToPayload(
  { ...matrixBase, plan_pz_nk_count: '110' },
  { scope: 'directions' },
)
ok(surplus.ok === true, 'directions scope accepts sum above final')

const below = planFormToPayload(
  { ...matrixBase, plan_pz_nk_count: '80', plan_tz_nk_count: '80', plan_az_nk_count: '80' },
  { scope: 'directions' },
)
ok(below.ok === false, 'directions scope rejects sum below final')

ok(
  evaluatePlanDirectionsForm(matrixBase).canSave === true,
  'evaluatePlanDirectionsForm canSave when minimum met',
)

const monthRows = [
  {
    pz_nk: 9,
    matrix_amounts: { pz_nk: 91800 },
  },
]

const comparison = buildPlanMatrixComparison({
  monthRows,
  planMatrix: {
    pz_nk: { count: 15, avg_check: 9503 },
    pz_dk: { count: 85, avg_check: 663 },
  },
  calendarContext: { month_relation: 'current', expected_plan_progress_pct: 90 },
})

ok(comparison.has_plan_matrix === true, 'comparison when plan_matrix set')
ok(comparison.rows.length === 2, 'two planned cells')
const pzNk = comparison.rows.find((r) => r.cellKey === 'pz_nk')
ok(pzNk?.fact.count === 9, 'fact count from daily rows')
ok(pzNk?.fact.avg_check === 10200, 'fact avg check computed')
ok(pzNk?.plan.avg_check === 9503, 'plan avg check preserved')
ok(comparison.volume_lag.some((r) => r.cellKey === 'pz_nk'), 'volume lag when behind pace')
ok(pzNk?.status?.status === 'lag', 'pz_nk status lag when behind pace and forecast')
ok(comparison.status_summary?.lag >= 1, 'status summary counts lagging rows')
ok(pzNk?.forecast?.count === 10, 'forecast count linear from fact at 90% calendar')
ok(pzNk?.forecast?.amount === 102000, 'forecast amount linear from fact at 90% calendar')
ok(Number(pzNk?.forecast?.amount_progress_pct) > 0, 'forecast amount progress pct computed')

const okRow = resolvePlanMatrixCellStatus(
  {
    plan: { amount: 100000, count: 10 },
    fact: { amount: 95000, count: 9 },
    count_progress_pct: 90,
    amount_progress_pct: 95,
    avg_gap_rub: 500,
    pace: { on_pace: true },
  },
  { month_relation: 'current', expected_plan_progress_pct: 90 },
)
ok(okRow.status === 'ok', 'status ok when pace and forecast meet plan')

const forecast = forecastPlanMatrixAmount(90000, { month_relation: 'current', expected_plan_progress_pct: 50 })
ok(forecast === 180000, 'linear forecast to month end')

const forecastCount = forecastPlanMatrixCount(9, { month_relation: 'current', expected_plan_progress_pct: 90 })
ok(forecastCount === 10, 'linear forecast count to month end')

const dailyPzNk = buildPlanMatrixCellDailySeries(
  [
    { report_date: '2026-07-01', pz_nk: 2, matrix_amounts: { pz_nk: 10000 } },
    { report_date: '2026-07-05', pz_nk: 3, matrix_amounts: { pz_nk: 15000 } },
  ],
  2026,
  7,
  'pz_nk',
)
ok(dailyPzNk.length === 31, 'daily series covers full july')
ok(dailyPzNk[0].count === 2 && dailyPzNk[0].amount === 10000 && dailyPzNk[0].hasReport, 'day 1 segment values')
ok(!dailyPzNk[1].hasReport, 'day 2 without report')
ok(dailyPzNk[4].count === 3 && dailyPzNk[4].amount === 15000, 'day 5 segment values')

const comparable = buildSegmentDailyComparableSeries(dailyPzNk, {
  daysInMonth: 31,
  plan: { count: 31, amount: 310000, avg_check: 10000 },
})
const day1 = comparable[0]
ok(day1.index_count === 200 && day1.index_amount === 100, 'day 1 pace vs daily plan norm')
ok(day1.norm_basis === 'plan', 'uses plan as norm basis')
const day5 = comparable[4]
ok(day5.index_count > 100, 'strong day above daily plan norm')

process.exit(failed > 0 ? 1 : 0)
