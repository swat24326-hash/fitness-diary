import {
  MIN_REPORT_DAYS_FOR_FORECAST,
  buildClubFinanceForecast,
  buildIskraMonthForecastSummary,
  daysInCalendarMonth,
  isCurrentCalendarMonth,
} from '../src/lib/admin/clubFinanceForecastCore.js'

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
ok(fc3.reportDays === 3, 'report days = 3')
ok(fc3.fact.earnings === 29400, 'fact earnings net of refunds')
ok(fc3.fact.refunds === 600, 'fact refunds sum')
ok(
  fc3.forecast.earnings === Math.round(29400 * (daysInMonth / 3) * 100) / 100,
  'forecast earnings scaled to month',
)
ok(
  fc3.forecast.refunds === Math.round(600 * (daysInMonth / 3) * 100) / 100,
  'forecast refunds scaled to month',
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

ok(fcTrain.ok, 'forecast trainings fallback')
ok(fcTrain.plan.directions.find((d) => d.key === 'pz')?.mode === 'trainings', 'pz falls back to trainings')
ok(fcTrain.plan.directions.find((d) => d.key === 'az')?.mode === 'trainings', 'az falls back to trainings')
ok(
  fcTrain.plan.directions.find((d) => d.key === 'pz')?.forecast === Math.round(15 * (daysInMonth / 3)),
  'pz trainings forecast scaled',
)

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

if (failed) process.exit(1)
console.log('verify-club-finance-forecast: all passed')
