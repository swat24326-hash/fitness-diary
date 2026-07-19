import {
  MIN_REPORT_DAYS_FOR_FORECAST,
  FORECAST_METHOD_UNIFORM,
  FORECAST_METHOD_WEEKDAY_WEEKEND,
  buildClubFinanceForecast,
  buildDirectionForecastLagSummary,
  buildIskraMonthForecastSummary,
  buildPlanCalendarNorm,
  daysInCalendarMonth,
  isCurrentCalendarMonth,
} from '../src/lib/admin/clubFinanceForecastCore.js'
import {
  MIN_WEEKDAY_SAMPLES_FOR_SPLIT,
  MIN_WEEKEND_SAMPLES_FOR_SPLIT,
  computePlanPaceNeeded,
  isoDateInMonth,
  projectMonthMetric,
  weekdayKindFromIso,
} from '../src/lib/admin/clubFinanceForecastProjection.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const today = new Date(2026, 6, 8) // 8 июля 2026
const year = 2026
const month = 7
const daysInMonth = daysInCalendarMonth(year, month)

ok(isCurrentCalendarMonth(year, month, today), 'july 2026 is current for test date')
ok(!isCurrentCalendarMonth(2026, 6, today), 'june is past relative to test date')
ok(weekdayKindFromIso('2026-07-04') === 'weekend', 'sat is weekend')
ok(weekdayKindFromIso('2026-07-06') === 'weekday', 'mon is weekday')

const rows3 = [
  { profit_nk: 10000, profit_dk: 0, profit_uk: 0, refunds_amount: 100 },
  { profit_nk: 10000, profit_dk: 0, profit_uk: 0, refunds_amount: 200 },
  { profit_nk: 10000, profit_dk: 0, profit_uk: 0, refunds_amount: 300 },
]

const fc3 = buildClubFinanceForecast({
  monthRows: rows3,
  year,
  month,
  expense: 360000,
  membershipTypes: [],
  today,
})

ok(fc3.ok, 'forecast ok with 3 reports')
ok(fc3.method === FORECAST_METHOD_UNIFORM, 'no dates → uniform method')
ok(fc3.reportDays === 3, 'report days = 3')
ok(fc3.fact.earnings === 29400, 'fact earnings net of refunds')
ok(fc3.fact.refunds === 600, 'fact refunds sum')
ok(fc3.forecast.refunds === fc3.fact.refunds, 'forecast refunds static (fact sum)')
ok(
  fc3.forecast.earnings === Math.round((30000 * (daysInMonth / 3) - 600) * 100) / 100,
  'forecast earnings = scaled gross minus static refunds',
)
ok(fc3.forecast.netProfit === fc3.forecast.earnings - fc3.forecast.expense, 'net without payroll when empty types')

const rows2 = rows3.slice(0, 2)
const fc2 = buildClubFinanceForecast({ monthRows: rows2, year, month, expense: 0, today })
ok(!fc2.ok && fc2.reason === 'insufficient_reports', 'min 3 reports required')
ok(fc2.minReportDays === MIN_REPORT_DAYS_FOR_FORECAST, 'min report days constant')

const fcPast = buildClubFinanceForecast({
  monthRows: rows3,
  year: 2026,
  month: 6,
  expense: 0,
  today,
})
ok(!fcPast.ok && fcPast.reason === 'not_current_month', 'no forecast for past month')

const payrollTypes = [{ id: 't1', trainer_pay_per_session: 500, trainer_assignable: true }]
const matrixRows = [
  {
    profit_nk: 5000,
    profit_dk: 0,
    profit_uk: 0,
    trainings_matrix: [{ trainer_id: 'tr1', membership_type_id: 't1', count: 2 }],
  },
  {
    profit_nk: 5000,
    profit_dk: 0,
    profit_uk: 0,
    trainings_matrix: [{ trainer_id: 'tr1', membership_type_id: 't1', count: 4 }],
  },
  {
    profit_nk: 5000,
    profit_dk: 0,
    profit_uk: 0,
    trainings_matrix: [{ trainer_id: 'tr1', membership_type_id: 't1', count: 6 }],
  },
]

const fcPay = buildClubFinanceForecast({
  monthRows: matrixRows,
  year,
  month,
  expense: 1000,
  membershipTypes: payrollTypes,
  today,
})

ok(fcPay.ok, 'forecast with payroll types')
ok(fcPay.fact.trainerPayroll === 6000, 'fact trainer payroll 2+4+6 × 500')
ok(
  fcPay.forecast.trainerPayroll === Math.round(6000 * (daysInMonth / 3) * 100) / 100,
  'forecast payroll scaled',
)
ok(
  fcPay.forecast.pzTrainings === Math.round(12 * (daysInMonth / 3)),
  'forecast pz trainings scaled',
)
ok(
  fcPay.forecast.netProfit ===
    fcPay.forecast.earnings - fcPay.forecast.trainerPayroll - fcPay.forecast.expense,
  'forecast net profit formula',
)

const planRows = [
  { profit_nk: 100000, profit_dk: 0, profit_uk: 0, matrix_amounts: { pz_nk: 80000, tz_nk: 10000, az_nk: 10000 } },
  { profit_nk: 100000, profit_dk: 0, profit_uk: 0, matrix_amounts: { pz_nk: 80000, tz_nk: 10000, az_nk: 10000 } },
  { profit_nk: 100000, profit_dk: 0, profit_uk: 0, matrix_amounts: { pz_nk: 80000, tz_nk: 10000, az_nk: 10000 } },
]

const fcPlan = buildClubFinanceForecast({
  monthRows: planRows,
  year,
  month,
  expense: 0,
  today,
  planForm: {
    plan_level_3: '1300000',
    plan_pz: '1067805',
    plan_tz: '130455',
    plan_az: '93200',
  },
})

ok(fcPlan.ok, 'forecast with plan targets')
ok(fcPlan.plan.level3 === 1300000, 'plan level 3 parsed')
ok(fcPlan.plan.factGross === 300000, 'plan fact gross')
ok(
  fcPlan.plan.forecastGross === Math.round(300000 * (daysInMonth / 3) * 100) / 100,
  'plan forecast gross scaled',
)
ok(fcPlan.plan.reach.willReach === fcPlan.plan.forecastProgressPercent >= 100, 'plan reach flag')
ok(fcPlan.plan.directions.length === 3, 'three direction rows')
ok(fcPlan.plan.directions[0].mode === 'revenue', 'pz uses revenue when matrix filled')
ok(
  fcPlan.plan.directions[0].forecast === Math.round(240000 * (daysInMonth / 3) * 100) / 100,
  'pz direction forecast scaled',
)

const lagUnit = buildDirectionForecastLagSummary([
  {
    key: 'pz',
    label: 'ПЗ',
    mode: 'revenue',
    planTarget: 1000000,
    forecast: 800000,
    forecastProgressPercent: 80,
    reach: { willReach: false, gapRub: 200000 },
  },
  {
    key: 'tz',
    label: 'ТЗ',
    mode: 'revenue',
    planTarget: 500000,
    forecast: 600000,
    forecastProgressPercent: 120,
    reach: { willReach: true, gapRub: 0 },
  },
])
ok(lagUnit.has_lag && lagUnit.lagging.length === 1 && lagUnit.lagging[0].key === 'pz', 'lag summary picks pz only')
ok(lagUnit.summary_ru.includes('ПЗ'), 'lag summary mentions hall label')

const fcPlanLag = buildClubFinanceForecast({
  monthRows: planRows,
  year,
  month,
  expense: 0,
  today,
  planForm: {
    plan_level_3: '5000000',
    plan_pz: '3000000',
    plan_tz: '130455',
    plan_az: '93200',
  },
})
ok(fcPlanLag.plan.directionLag.has_lag, 'direction lag when pz below plan')
ok(fcPlanLag.plan.directionLag.lagging.some((d) => d.key === 'pz'), 'pz in lag list')
ok(
  !fcPlanLag.plan.directionLag.lagging.some((d) => d.key === 'tz'),
  'tz not lagging when forecast above plan',
)

const trainingOnlyRows = [
  {
    profit_nk: 10000,
    profit_dk: 0,
    profit_uk: 0,
    trainings_matrix: [{ trainer_id: 'tr1', membership_type_id: 't1', count: 5 }],
    aerobic_sales_matrix: [{ membership_type_id: 'a1', count: 3 }],
  },
  {
    profit_nk: 10000,
    profit_dk: 0,
    profit_uk: 0,
    trainings_matrix: [{ trainer_id: 'tr1', membership_type_id: 't1', count: 5 }],
    aerobic_sales_matrix: [{ membership_type_id: 'a1', count: 3 }],
  },
  {
    profit_nk: 10000,
    profit_dk: 0,
    profit_uk: 0,
    trainings_matrix: [{ trainer_id: 'tr1', membership_type_id: 't1', count: 5 }],
    aerobic_sales_matrix: [{ membership_type_id: 'a1', count: 3 }],
  },
]

const fcTrain = buildClubFinanceForecast({
  monthRows: trainingOnlyRows,
  year,
  month,
  expense: 0,
  today,
  planForm: { plan_level_3: '100000', plan_pz: '50000', plan_az: '20000' },
})

ok(fcTrain.ok, 'forecast no-revenue directions')
ok(fcTrain.plan.directions.find((d) => d.key === 'pz')?.mode === 'no_revenue', 'pz no revenue mode')
ok(fcTrain.plan.directions.find((d) => d.key === 'az')?.mode === 'no_revenue', 'az no revenue mode')
ok(fcTrain.plan.directions.find((d) => d.key === 'pz')?.noteRu === 'Нет выручки по залу', 'pz note ru')
ok(fcTrain.plan.directions.find((d) => d.key === 'pz')?.forecast === 0, 'pz forecast rub is 0 without revenue')
ok(fcTrain.plan.directions.find((d) => d.key === 'pz')?.forecastProgressPercent === 0, 'pz no false plan %')
ok(
  fcTrain.plan.directions.find((d) => d.key === 'pz')?.trainingsForecast === Math.round(15 * (daysInMonth / 3)),
  'pz trainings still projected as hint',
)
ok(!fcTrain.plan.directionLag.lagging.some((d) => d.key === 'pz'), 'pz not in lag without revenue ₽')

const iskra = buildIskraMonthForecastSummary({
  monthRows: rows3,
  year,
  month,
  expense: 360000,
  membershipTypes: [],
  planForm: { plan_level_3: '1300000' },
  includeFinance: true,
  today,
})
ok(iskra.available, 'iskra forecast available')
ok(iskra.forecast_gross_total === fc3.plan.forecastGross, 'iskra gross matches finance forecast')
ok(iskra.shortfall_rub > 0 && iskra.surplus_rub === 0, 'iskra shortfall when below plan')
ok(Number.isFinite(Number(iskra.forecast_net_profit)), 'iskra net profit when finance on')

const iskraNoFinance = buildIskraMonthForecastSummary({
  monthRows: rows3,
  year,
  month,
  expense: 360000,
  planForm: { plan_level_3: '1300000' },
  includeFinance: false,
  today,
})
ok(iskraNoFinance.available && iskraNoFinance.forecast_net_profit === undefined, 'iskra hides net profit without finance')

const iskraPast = buildIskraMonthForecastSummary({
  monthRows: rows3,
  year: 2026,
  month: 6,
  today,
})
ok(!iskraPast.available && iskraPast.reason === 'not_current_month', 'iskra past month blocked')

/** Будни 1–3 июля (ср–пт) по 100k, выходные 4–5 (сб–вс) по 10k. */
const splitRows = [
  { report_date: '2026-07-01', profit_nk: 100000, profit_dk: 0, profit_uk: 0 },
  { report_date: '2026-07-02', profit_nk: 100000, profit_dk: 0, profit_uk: 0 },
  { report_date: '2026-07-03', profit_nk: 100000, profit_dk: 0, profit_uk: 0 },
  { report_date: '2026-07-04', profit_nk: 10000, profit_dk: 0, profit_uk: 0 },
  { report_date: '2026-07-05', profit_nk: 10000, profit_dk: 0, profit_uk: 0 },
]

const splitProj = projectMonthMetric({
  monthRows: splitRows,
  year,
  month,
  getValue: (row) => Number(row.profit_nk) || 0,
  roundFn: (n) => Math.round(n * 100) / 100,
})
ok(splitProj.method === FORECAST_METHOD_WEEKDAY_WEEKEND, 'split method when enough weekday+weekend')
ok(splitProj.weekdaySamples >= MIN_WEEKDAY_SAMPLES_FOR_SPLIT, 'weekday samples ok')
ok(splitProj.weekendSamples >= MIN_WEEKEND_SAMPLES_FOR_SPLIT, 'weekend samples ok')
ok(splitProj.weekdayAvg === 100000, 'weekday avg 100k')
ok(splitProj.weekendAvg === 10000, 'weekend avg 10k')

const expectedSplit =
  Math.round(
    (320000 + 100000 * splitProj.remainingWeekdays + 10000 * splitProj.remainingWeekends) * 100,
  ) / 100
ok(splitProj.forecastTotal === expectedSplit, 'split forecast = fact + remaining day types')
ok(
  splitProj.forecastTotal !== Math.round(320000 * (daysInMonth / 5) * 100) / 100,
  'split differs from naive average×days',
)

const fcSplit = buildClubFinanceForecast({
  monthRows: splitRows,
  year,
  month,
  expense: 0,
  today,
  planForm: { plan_level_3: '2000000' },
})
ok(fcSplit.ok && fcSplit.method === FORECAST_METHOD_WEEKDAY_WEEKEND, 'finance forecast uses weekday/weekend')
ok(fcSplit.plan.forecastGross === expectedSplit, 'plan gross matches split projection')
ok(
  fcSplit.dayType.remainingWeekdays + fcSplit.dayType.remainingWeekends === daysInMonth - 5,
  'remaining fills month',
)

/** Только будни — fallback на среднее × дни. */
const weekdayOnly = [
  { report_date: '2026-07-01', profit_nk: 50000, profit_dk: 0, profit_uk: 0 },
  { report_date: '2026-07-02', profit_nk: 50000, profit_dk: 0, profit_uk: 0 },
  { report_date: '2026-07-03', profit_nk: 50000, profit_dk: 0, profit_uk: 0 },
]
const fcWdOnly = buildClubFinanceForecast({
  monthRows: weekdayOnly,
  year,
  month,
  expense: 0,
  today,
})
ok(fcWdOnly.method === FORECAST_METHOD_UNIFORM, 'weekday-only falls back to uniform')
ok(
  fcWdOnly.plan.forecastGross === Math.round(150000 * (daysInMonth / 3) * 100) / 100,
  'weekday-only uses scale',
)

ok(isoDateInMonth(2026, 7, 5) === '2026-07-05', 'isoDateInMonth pads')

const paceAtPlan = computePlanPaceNeeded({
  planTarget: 100000,
  factGross: 120000,
  remainingWeekdays: 10,
  remainingWeekends: 4,
  daysInMonth: 31,
  reportDays: 5,
})
ok(paceAtPlan?.mode === 'already_at_plan' && paceAtPlan.perDayRub === 0, 'pace already at plan')

const paceWeekday = computePlanPaceNeeded({
  planTarget: 1000000,
  factGross: 400000,
  remainingWeekdays: 10,
  remainingWeekends: 4,
  daysInMonth: 31,
  reportDays: 5,
})
ok(paceWeekday?.mode === 'weekday', 'pace uses weekdays')
ok(paceWeekday.gapRub === 600000, 'pace gap')
ok(paceWeekday.perDayRub === 60000, 'pace 600k / 10 weekdays')

const paceAny = computePlanPaceNeeded({
  planTarget: 100000,
  factGross: 40000,
  remainingWeekdays: 0,
  remainingWeekends: 0,
  daysInMonth: 31,
  reportDays: 10,
})
ok(paceAny?.mode === 'any_day' && paceAny.perDayRub === Math.round((60000 / 21) * 100) / 100, 'pace fallback any day')

ok(fcSplit.plan.pace?.mode === 'weekday', 'split forecast exposes weekday pace')
ok(fcSplit.plan.pace?.gapRub === Math.round((2000000 - 320000) * 100) / 100, 'split pace gap to plan')
ok(
  fcSplit.plan.pace?.perDayRub ===
    Math.round(((2000000 - 320000) / fcSplit.dayType.remainingWeekdays) * 100) / 100,
  'split pace per weekday',
)

const expectedCalPct = Math.round((8 / 31) * 1000) / 10
const calNormUnit = buildPlanCalendarNorm({
  year,
  month,
  factProgressPercent: 10,
  today,
})
ok(calNormUnit?.expectedPct === expectedCalPct, 'calendar norm 8/31')
ok(calNormUnit?.vs === 'behind', 'fact 10% behind calendar mid-early july')
ok(fcPlan.plan.calendarNorm?.expectedPct === expectedCalPct, 'plan forecast exposes calendar norm')
ok(
  fcPlan.plan.calendarNorm?.factPct === fcPlan.plan.factProgressPercent,
  'calendar norm fact matches plan fact %',
)

if (failed) process.exit(1)
console.log('verify-club-finance-forecast: all passed')
