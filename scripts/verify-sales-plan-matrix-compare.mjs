import {
  buildPlanMatrixComparison,
  buildPlanMatrixCellDailySeries,
  buildSegmentDailyComparableSeries,
  resolvePlanMatrixCellStatus,
  resolveSegmentChartPlanLines,
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
ok((okRow.risks ?? []).length === 0, 'no risks when count and avg on plan')
ok((okRow.problems ?? []).length === 0, 'no problems when fully on pace')

const moneyOkAvgRisk = resolvePlanMatrixCellStatus(
  {
    plan: { amount: 100000, count: 10 },
    fact: { amount: 120000, count: 20 },
    count_progress_pct: 200,
    amount_progress_pct: 120,
    avg_gap_rub: -2000,
    pace: { on_pace: true },
  },
  { month_relation: 'current', expected_plan_progress_pct: 50 },
)
ok(moneyOkAvgRisk.status === 'ok', 'status ok when money/forecast ok despite low avg')
ok(
  moneyOkAvgRisk.risks?.some((r) => r.key === 'avg') === true,
  'avg risk chip when average check below plan',
)
ok(
  moneyOkAvgRisk.problems?.some(
    (p) => p.key === 'avg' && p.label === 'средний чек' && String(p.delta_text).includes('2'),
  ) === true,
  'avg problem shows readable label and delta',
)
ok(
  moneyOkAvgRisk.problems?.every((p) => p.key !== 'forecast') === true,
  'no forecast problem when money status ok',
)

const moneyOkCountRisk = resolvePlanMatrixCellStatus(
  {
    plan: { amount: 100000, count: 100 },
    fact: { amount: 95000, count: 40 },
    count_progress_pct: 40,
    amount_progress_pct: 95,
    avg_gap_rub: 5000,
    pace: { on_pace: false, expected_count: 90 },
  },
  { month_relation: 'current', expected_plan_progress_pct: 90 },
)
ok(moneyOkCountRisk.status === 'ok', 'status ok when money ok despite volume lag')
ok(
  moneyOkCountRisk.risks?.some((r) => r.key === 'count') === true,
  'count risk chip when volume behind pace',
)
ok(
  moneyOkCountRisk.problems?.some(
    (p) =>
      p.key === 'count' &&
      p.label === 'количество абонементов' &&
      p.delta_text === '−50',
  ) === true,
  'count problem uses expected−fact shortfall',
)

const moneyLag = resolvePlanMatrixCellStatus(
  {
    plan: { amount: 100000, count: 10 },
    fact: { amount: 40000, count: 10 },
    count_progress_pct: 100,
    amount_progress_pct: 40,
    avg_gap_rub: -1000,
    pace: { on_pace: true },
  },
  { month_relation: 'current', expected_plan_progress_pct: 90 },
)
ok(moneyLag.status === 'lag', 'status lag when amount/forecast behind')
ok(moneyLag.risks?.some((r) => r.key === 'avg') === true, 'risks still listed when money lags')
ok(
  moneyLag.problems?.some((p) => p.key === 'forecast' && p.label === 'прогноз') === true,
  'forecast shortfall problem when status lags',
)
ok(moneyLag.label === 'Отстаём', 'lag label is Отстаём')
ok(String(moneyLag.problems?.find((p) => p.key === 'forecast')?.delta_text ?? '').startsWith('−'), 'forecast delta negative')

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

const planLines = resolveSegmentChartPlanLines({ count: 31, amount: 310000, avg_check: 10000 }, 31)
ok(planLines.hasPlan === true, 'plan lines when matrix plan set')
ok(planLines.amount === 10000, 'daily amount plan = month / days')
ok(planLines.count === 1, 'daily count plan = month / days')
ok(planLines.avg === 10000, 'avg plan level from matrix')

process.exit(failed > 0 ? 1 : 0)
