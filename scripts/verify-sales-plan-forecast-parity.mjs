/**
 * Сверка: сегменты ↔ залы ↔ клуб. Дыры в плане/факте/прогнозе должны ломаться здесь.
 */
import { buildClubFinanceForecast } from '../src/lib/admin/clubFinanceForecastCore.js'
import { buildSalesManagerMonthStats } from '../src/lib/admin/salesManagerStatsAgg.js'
import { roundPlanRub } from '../src/lib/admin/salesPlanMatrixCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

function near(a, b, eps = 0.05) {
  return Math.abs(Number(a) - Number(b)) < eps
}

const today = new Date(2026, 6, 8)
const year = 2026
const month = 7

const monthRows = [
  {
    report_date: '2026-07-01',
    profit_nk: 50000,
    profit_dk: 80000,
    profit_uk: 10000,
    pz_nk: 2,
    pz_dk: 8,
    tz_nk: 1,
    tz_dk: 2,
    az_dk: 1,
    matrix_amounts: { pz_nk: 20000, pz_dk: 60000, tz_nk: 10000, tz_dk: 30000, az_dk: 8000 },
  },
  {
    report_date: '2026-07-02',
    profit_nk: 40000,
    profit_dk: 70000,
    profit_uk: 8000,
    pz_nk: 1,
    pz_dk: 7,
    tz_nk: 1,
    tz_dk: 2,
    az_dk: 1,
    matrix_amounts: { pz_nk: 10000, pz_dk: 50000, tz_nk: 9000, tz_dk: 25000, az_dk: 7000 },
  },
  {
    report_date: '2026-07-03',
    profit_nk: 45000,
    profit_dk: 90000,
    profit_uk: 9000,
    pz_nk: 2,
    pz_dk: 9,
    tz_nk: 1,
    tz_dk: 3,
    az_dk: 1,
    matrix_amounts: { pz_nk: 18000, pz_dk: 70000, tz_nk: 11000, tz_dk: 28000, az_dk: 9000 },
  },
]

const planMatrix = {
  pz_nk: { count: 40, avg_check: 10740 },
  pz_dk: { count: 330, avg_check: 6010 },
  tz_nk: { count: 85, avg_check: 10164 },
  tz_dk: { count: 38, avg_check: 10531 },
  az_dk: { count: 40, avg_check: 6500 },
}

const planDirections = {
  plan_pz: 1_983_300 + 429_600,
  plan_tz: 863_940 + 400_178,
  plan_az: 260_000,
  plan_extra: 82_700,
}

const planLevels = { level1: 3_800_000, level2: 4_000_000, level3: 4_200_000 }

const stats = buildSalesManagerMonthStats({
  monthRows,
  planLevels,
  planDirections,
  planMatrix,
  membershipTypes: [],
  year,
  month,
  today,
})

const cmp = stats.planMatrixComparison
ok(cmp.has_plan_matrix === true, 'matrix comparison present')

const chips = cmp.status_summary
ok(
  chips.ok + chips.risk + chips.lag + (chips.muted || 0) === chips.total,
  'chips partition all segment rows',
)
ok(chips.total === cmp.rows.length, 'chip total = row count')

for (const row of cmp.rows) {
  const planAmt = roundPlanRub(row.plan.amount)
  const factAmt = roundPlanRub(row.fact.amount)
  const fcAmt = roundPlanRub(row.forecast.amount)
  ok(fcAmt + 0.009 >= factAmt, `${row.cellKey}: forecast ₽ ≥ fact ₽`)
  ok(planAmt === roundPlanRub(row.plan.count * row.plan.avg_check), `${row.cellKey}: plan ₽ = шт × чек`)
  ok(
    near(row.status?.forecast_amount, row.forecast.amount),
    `${row.cellKey}: status forecast = column forecast`,
  )
  const shown = row.status?.problems?.find((p) => p.key === 'forecast')
  const shortfall = roundPlanRub(planAmt - fcAmt)
  if (row.status?.status === 'lag' && shortfall > 0.5) {
    ok(shown != null, `${row.cellKey}: lag shows forecast shortfall chip`)
    const digits = String(shown?.delta_text ?? '').replace(/[^\d]/g, '')
    const shownAbs = Number(digits.replace(/\s/g, ''))
    ok(shownAbs === Math.round(Math.abs(shortfall)), `${row.cellKey}: red прогноз = план − прогноз колонки`)
  }
  if (row.status?.status === 'ok') {
    ok(!shown, `${row.cellKey}: no forecast chip when in pace`)
  }
}

const fc = buildClubFinanceForecast({
  monthRows,
  year,
  month,
  expense: 0,
  membershipTypes: [],
  today,
  planForm: {
    plan_level_1: String(planLevels.level1),
    plan_level_2: String(planLevels.level2),
    plan_level_3: String(planLevels.level3),
    plan_pz: String(planDirections.plan_pz),
    plan_tz: String(planDirections.plan_tz),
    plan_az: String(planDirections.plan_az),
    plan_extra: String(planDirections.plan_extra),
    plan_pz_nk_count: '40',
    plan_pz_nk_avg: '10740',
    plan_pz_dk_count: '330',
    plan_pz_dk_avg: '6010',
    plan_tz_nk_count: '85',
    plan_tz_nk_avg: '10164',
    plan_tz_dk_count: '38',
    plan_tz_dk_avg: '10531',
    plan_az_dk_count: '40',
    plan_az_dk_avg: '6500',
  },
})

ok(fc.ok === true, 'club forecast ok')
ok(near(fc.plan.factGross, fc.plan.totals.factSum), 'club fact = table fact')
ok(near(fc.plan.forecastGross, fc.plan.totals.forecastSum), 'club forecast = table forecast')
if (fc.plan.totals?.directionsAbove) {
  ok(
    fc.plan.forecastProgressPercent !== fc.plan.totals.progressVsPlanSum,
    '% клуба ≠ % суммы направлений when plans exceed final',
  )
}

const signedSum = (fc.plan.directions ?? [])
  .filter((d) => d.mode === 'revenue')
  .reduce((s, d) => s + (Number(d.reach?.signedGapRub) || 0), 0)
ok(near(signedSum, fc.plan.totals.signedDirectionGapRub), 'сумма «до плана» строк = итого')

for (const hall of ['pz', 'tz', 'az']) {
  const dir = fc.plan.directions.find((d) => d.key === hall)
  if (!dir || dir.mode !== 'revenue') continue
  const cellSum = cmp.rows
    .filter((r) => r.hall === hall)
    .reduce((s, r) => s + (Number(r.forecast?.amount) || 0), 0)
  const factSum = cmp.rows
    .filter((r) => r.hall === hall)
    .reduce((s, r) => s + (Number(r.fact?.amount) || 0), 0)
  if (factSum <= Number(dir.forecast) + 0.02 && Number(dir.forecast) > 0) {
    ok(near(cellSum, dir.forecast, 0.5), `${hall}: сумма прогноза сегментов = залу`)
  }
}

const fcAbove = buildClubFinanceForecast({
  monthRows,
  year,
  month,
  expense: 0,
  membershipTypes: [],
  today,
  planForm: {
    plan_level_3: '3500000',
    plan_pz: String(planDirections.plan_pz),
    plan_tz: String(planDirections.plan_tz),
    plan_az: String(planDirections.plan_az),
    plan_extra: String(planDirections.plan_extra),
  },
})
ok(fcAbove.ok && fcAbove.plan.totals?.directionsAbove, 'fixture with directions above final')
ok(
  fcAbove.plan.totals.progressVsPlanSum < fcAbove.plan.totals.clubProgressPercent,
  '% таблицы направлений ниже % клуба, если сумма планов больше финала',
)

if (failed) {
  console.error(`verify-sales-plan-forecast-parity: ${failed} failed`)
  process.exit(1)
}
console.log('verify-sales-plan-forecast-parity: all passed')
