import {
  MIN_REPORT_DAYS_FOR_FORECAST,
  FORECAST_METHOD_UNIFORM,
  FORECAST_METHOD_WEEKDAY_WEEKEND,
  appendUnallocatedPlanRow,
  buildClubFinanceForecast,
  buildDirectionForecastLagSummary,
  buildDirectionTotals,
  buildIskraClubFinanceBlock,
  buildIskraMonthForecastSummary,
  buildPlanCalendarNorm,
  daysInCalendarMonth,
  describePlanForecastReach,
  isCurrentCalendarMonth,
  reconcileDirectionForecastsToClubGross,
  sumDirectionPlanTargets,
  sumRevenueDirectionFact,
  sumRevenueDirectionForecast,
} from '../src/lib/admin/clubFinanceForecastCore.js'
import {
  MIN_WEEKDAY_SAMPLES_FOR_SPLIT,
  MIN_WEEKEND_SAMPLES_FOR_SPLIT,
  computePlanMoneyNormToDate,
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
ok(fc3.forecast.refunds > fc3.fact.refunds, 'forecast refunds paced above fact (≥2 days with refund)')
ok(fc3.refundsPace?.paced === true, 'refunds pace flag')
ok(
  fc3.forecast.earnings === Math.round((30000 * (daysInMonth / 3) - fc3.forecast.refunds) * 100) / 100,
  'forecast earnings = scaled gross minus paced refunds',
)
ok(fc3.forecast.netProfit === fc3.forecast.earnings - fc3.forecast.expense, 'net without payroll when empty types')

const rowsRefundSparse = [
  { profit_nk: 10000, profit_dk: 0, profit_uk: 0, refunds_amount: 500 },
  { profit_nk: 10000, profit_dk: 0, profit_uk: 0, refunds_amount: 0 },
  { profit_nk: 10000, profit_dk: 0, profit_uk: 0, refunds_amount: 0 },
]
const fcSparseRefunds = buildClubFinanceForecast({
  monthRows: rowsRefundSparse,
  year,
  month,
  expense: 0,
  today,
})
ok(fcSparseRefunds.ok && fcSparseRefunds.forecast.refunds === 500, 'sparse refunds stay fact')
ok(fcSparseRefunds.refundsPace?.paced === false, 'sparse refunds not paced')

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
ok(fcPast.ok === true && fcPast.closedMonth === true, 'past month shows closed fact')
ok(fcPast.method === 'closed_month_fact', 'closed month method is fact-only')
ok(fcPast.forecast.earnings === fcPast.fact.earnings, 'past month forecast equals fact (no extrapolate)')
ok(fcPast.forecast.pzTrainings === fcPast.fact.pzTrainings, 'past month trainings fact-only')

const fcFuture = buildClubFinanceForecast({
  monthRows: rows3,
  year: 2026,
  month: 12,
  expense: 0,
  today,
})
ok(!fcFuture.ok && fcFuture.reason === 'not_current_month', 'no fact/forecast for future month')

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
  fcPay.forecast.pzTrainings === Math.round(12 * (daysInMonth / 3)),
  'forecast pz trainings scaled',
)
ok(
  fcPay.forecast.trainerPayroll === Math.round(fcPay.forecast.pzTrainings * 500 * 100) / 100,
  'forecast payroll = hours × rate (tiers equal to session)',
)
ok(fcPay.payrollPace?.trainer === 'payroll_from_projected_tiers', 'payroll uses projected tiers')
ok(
  fcPay.forecast.netProfit ===
    fcPay.forecast.earnings - fcPay.forecast.trainerPayroll - fcPay.forecast.expense,
  'forecast net profit formula',
)

// С ростом уровня прогноз ЗП выше, чем замороженная средняя MTD.
const tierTypes = [
  {
    id: 't1',
    trainer_pay_per_session: 200,
    trainer_pay_l1: 200,
    trainer_pay_l2: 350,
    trainer_pay_l3: 500,
    trainer_assignable: true,
    counts_toward_pay_plan: true,
  },
]
const tierProfiles = new Map([
  ['tr1', { trainer_id: 'tr1', club_id: 'c1', on_plan: true, rate_adjustment_rub: 0 }],
])
const fcTier = buildClubFinanceForecast({
  monthRows: matrixRows,
  year,
  month,
  expense: 0,
  membershipTypes: tierTypes,
  planConfig: { workouts_l2_min: 80, workouts_l3_min: 120 },
  profilesByTrainerId: tierProfiles,
  clubId: 'c1',
  today,
})
const frozenAvg =
  Math.round(((fcTier.fact.trainerPayroll / fcTier.fact.pzTrainings) * fcTier.forecast.pzTrainings) * 100) / 100
ok(fcTier.payrollPace?.trainer === 'payroll_from_projected_tiers', 'tier climb uses projected method')
ok(fcTier.forecast.trainerPayroll > frozenAvg, 'tier climb: forecast ZP > frozen MTD average')
ok(
  fcTier.forecast.netProfit ===
    fcTier.forecast.earnings - fcTier.forecast.trainerPayroll - fcTier.forecast.expense,
  'net still earnings − ZP − expense',
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
ok(
  fcPlan.plan.directions.filter((d) => d.key === 'pz' || d.key === 'tz' || d.key === 'az').length === 3,
  'three hall direction rows',
)
ok(fcPlan.plan.directions[0].mode === 'revenue', 'pz uses revenue when matrix filled')
ok(
  sumRevenueDirectionForecast(fcPlan.plan.directions) === fcPlan.plan.forecastGross,
  'direction forecasts sum to club forecast',
)
ok(
  sumRevenueDirectionFact(fcPlan.plan.directions) === fcPlan.plan.factGross,
  'direction facts sum to club fact',
)
ok(fcPlan.plan.totals?.factMatchesClub && fcPlan.plan.totals?.forecastMatchesClub, 'plan.totals match club')
ok(fcPlan.plan.directions.some((d) => d.key === 'unallocated'), 'unallocated row when directions below level3')
ok(fcPlan.plan.totals?.planMatchesLevel3, 'plan sum with unallocated matches level3')
ok(fcPlan.plan.totals?.clubGapRub === fcPlan.plan.reach.gapRub, 'totals club gap = reach gap')
ok(
  Math.abs(
    fcPlan.plan.directions[0].forecast - Math.round(240000 * (daysInMonth / 3) * 100) / 100,
  ) < 1,
  'pz direction forecast near pace (club reconcile may nudge копейки)',
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

const reconcileUnit = reconcileDirectionForecastsToClubGross(
  [
    { key: 'pz', mode: 'revenue', planTarget: 1000, fact: 90, forecast: 200 },
    { key: 'tz', mode: 'revenue', planTarget: 1000, fact: 90, forecast: 200 },
    { key: 'az', mode: 'revenue', planTarget: 1000, fact: 90, forecast: 200 },
  ],
  300,
  { describeReach: describePlanForecastReach },
)
ok(sumRevenueDirectionForecast(reconcileUnit) === 300, 'reconcile preserves club target with floors')
ok(
  reconcileUnit.every((d) => d.forecast >= d.fact - 0.001),
  'reconcile never below fact',
)
const reconcileFloor = reconcileDirectionForecastsToClubGross(
  [
    { key: 'pz', mode: 'revenue', planTarget: 1000, fact: 90, forecast: 200 },
    { key: 'tz', mode: 'revenue', planTarget: 1000, fact: 90, forecast: 200 },
    { key: 'az', mode: 'revenue', planTarget: 1000, fact: 90, forecast: 200 },
  ],
  200,
  { describeReach: describePlanForecastReach },
)
ok(
  sumRevenueDirectionForecast(reconcileFloor) === 270,
  'reconcile cannot go below sum of facts',
)

const dopRows = [
  {
    profit_nk: 99000,
    profit_dk: 0,
    profit_uk: 0,
    matrix_amounts: { pz_nk: 80000, tz_nk: 10000, az_nk: 9000, dop_total: 1000 },
  },
  {
    profit_nk: 99000,
    profit_dk: 0,
    profit_uk: 0,
    matrix_amounts: { pz_nk: 80000, tz_nk: 10000, az_nk: 9000, dop_total: 1000 },
  },
  {
    profit_nk: 99000,
    profit_dk: 0,
    profit_uk: 0,
    matrix_amounts: { pz_nk: 80000, tz_nk: 10000, az_nk: 9000, dop_total: 1000 },
  },
]
const fcDop = buildClubFinanceForecast({
  monthRows: dopRows,
  year,
  month,
  expense: 0,
  today,
  planForm: {
    plan_level_3: '1300000',
    plan_pz: '1000000',
    plan_tz: '150000',
    plan_az: '120000',
    plan_extra: '30000',
  },
})
ok(fcDop.ok, 'forecast with dop')
ok(fcDop.plan.directions.some((d) => d.key === 'extra'), 'extra direction row shown')
ok(sumRevenueDirectionFact(fcDop.plan.directions) === fcDop.plan.factGross, 'dop facts sum to club')
ok(
  sumRevenueDirectionForecast(fcDop.plan.directions) === fcDop.plan.forecastGross,
  'dop forecasts sum to club',
)

const unallocUnit = appendUnallocatedPlanRow(
  [
    { key: 'pz', mode: 'revenue', planTarget: 400, fact: 10, forecast: 50 },
    { key: 'tz', mode: 'revenue', planTarget: 400, fact: 10, forecast: 50 },
  ],
  1000,
  describePlanForecastReach,
)
ok(unallocUnit.some((d) => d.key === 'unallocated' && d.planTarget === 200), 'append unallocated 200')
ok(sumDirectionPlanTargets(unallocUnit) === 1000, 'unallocated fills plan to level3')
const totalsUnit = buildDirectionTotals({
  directions: unallocUnit,
  level3: 1000,
  factGross: 20,
  forecastGross: 100,
  closedMonth: false,
})
ok(totalsUnit.clubGapRub === 900, 'totals club gap to level3')
ok(totalsUnit.directionsBelow && totalsUnit.unallocatedRub === 200, 'totals marks directions below')

const fcSurplus = buildClubFinanceForecast({
  monthRows: planRows,
  year,
  month,
  expense: 0,
  today,
  planForm: {
    plan_level_3: '1000000',
    plan_pz: '1067805',
    plan_tz: '130455',
    plan_az: '93200',
  },
})
ok(fcSurplus.ok && !fcSurplus.plan.directions.some((d) => d.key === 'unallocated'), 'no unallocated when above level3')
ok(fcSurplus.plan.totals?.directionsAbove, 'totals marks directions above')
ok(fcSurplus.plan.totals?.planNoteRu.includes('выше финала'), 'surplus note ru')

const iskraClub = buildIskraClubFinanceBlock({
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
ok(iskraClub.available && iskraClub.forecast?.totals?.unallocated_rub > 0, 'iskra exposes direction totals')

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
ok(Number.isFinite(Number(iskra.forecast_net_profit_margin_pct)), 'iskra forecast margin when finance on')

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
const moneyNorm = computePlanMoneyNormToDate({
  planTarget: 1300000,
  factGross: 709480,
  daysElapsed: 19,
  daysInMonth: 30,
})
ok(moneyNorm?.expectedRub === 823333.33, 'money norm = plan × 19/30')
ok(moneyNorm?.pacePct === 86.2, 'pace ≈ 86.2% of norm ₽')
ok(moneyNorm?.lagRub === -113853.33, 'lag = fact − norm ₽')
ok(moneyNorm?.vs === 'behind', '709k vs 823k norm is behind')

const moneyAhead = computePlanMoneyNormToDate({
  planTarget: 1100000,
  factGross: 709480,
  daysElapsed: 19,
  daysInMonth: 30,
})
ok(moneyAhead?.pacePct > 100 && moneyAhead.vs === 'on_track', 'slightly over prorated stays on_track (±8)')
const moneyFarAhead = computePlanMoneyNormToDate({
  planTarget: 1100000,
  factGross: 800000,
  daysElapsed: 19,
  daysInMonth: 30,
})
ok(moneyFarAhead?.vs === 'ahead', 'well over prorated → ahead')

const calNormUnit = buildPlanCalendarNorm({
  year,
  month,
  planTarget: 1300000,
  factGross: 300000,
  today,
})
ok(calNormUnit?.expectedPct === expectedCalPct, 'calendar share still exposed as expectedPct')
ok(calNormUnit?.expectedRub === Math.round((1300000 * (8 / 31)) * 100) / 100, 'july 8/31 money norm')
ok(calNormUnit?.method === 'plan_times_elapsed_share', 'money norm method')
ok(fcPlan.plan.calendarNorm?.expectedRub > 0, 'plan forecast exposes money norm')
ok(
  Math.abs(fcPlan.plan.calendarNorm.pacePct - (fcPlan.plan.factGross / fcPlan.plan.calendarNorm.expectedRub) * 100) < 0.15,
  'forecast card pace from fact/norm',
)

if (failed) process.exit(1)
console.log('verify-club-finance-forecast: all passed')
