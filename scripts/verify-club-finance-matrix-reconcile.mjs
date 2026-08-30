import {
  allocateForecastsByPaceWeights,
  allocateMatrixForecastsToClubGross,
} from '../src/lib/admin/clubFinanceMatrixReconcileCore.js'
import { buildClubFinanceForecast } from '../src/lib/admin/clubFinanceForecastCore.js'
import {
  planMatrixCountField,
  planMatrixAvgField,
  PLAN_MATRIX_HALL_CELL_KEYS,
} from '../src/lib/admin/salesPlanMatrixCore.js'
import { sumRevenueDirectionForecast } from '../src/lib/admin/clubFinanceForecastReconcileCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const alloc = allocateForecastsByPaceWeights(
  [
    { fact: 100, pace: 200 },
    { fact: 50, pace: 100 },
  ],
  400,
)
ok(alloc.length === 2, 'alloc rows')
ok(Math.abs(alloc[0].forecast + alloc[1].forecast - 400) < 0.02, 'alloc sum = target')

const matrixAlloc = allocateMatrixForecastsToClubGross({
  cells: [
    { cellKey: 'pz_nk', factRub: 300, paceForecast: 350 },
    { cellKey: 'pz_dk', factRub: 200, paceForecast: 250 },
  ],
  clubForecastGross: 700,
  dopFact: 100,
  dopPaceForecast: 120,
})
ok(Math.abs(matrixAlloc.sumCheck - 700) < 0.02, 'matrix+dop = club forecast')

const today = new Date(2026, 7, 30)
const plan = 1_200_000
const factTarget = 969_048
const reportDays = 29
const dailyGross = factTarget / reportDays
/** @type {Array<Record<string, unknown>>} */
const monthRows = []
for (let d = 1; d <= reportDays; d += 1) {
  monthRows.push({
    report_date: `2026-08-${String(d).padStart(2, '0')}`,
    profit_nk: dailyGross,
    profit_dk: 0,
    profit_uk: 0,
    matrix_amounts: { pz_nk: dailyGross * 0.5, pz_dk: dailyGross * 0.5 },
    pz_nk: 1,
    pz_dk: 1,
    trainings_matrix: [],
    aerobic_sales_matrix: [],
  })
}

/** @type {Record<string, string>} */
const planForm = { plan_level_3: String(plan) }
for (const cellKey of PLAN_MATRIX_HALL_CELL_KEYS) {
  planForm[planMatrixCountField(cellKey)] = '50'
  planForm[planMatrixAvgField(cellKey)] = '2600'
}

const fc = buildClubFinanceForecast({
  monthRows,
  year: 2026,
  month: 8,
  expense: 0,
  membershipTypes: [],
  planForm,
  today,
})

ok(fc.ok, 'forecast ok')
ok(Math.abs(fc.plan.factGross - factTarget) < 500, 'club fact ~ target')
ok(
  Math.abs(fc.plan.forecastGross - fc.plan.profitPaceGross) < 0.02,
  'card forecast = profit pace',
)
ok(
  Math.abs(fc.plan.purchaseMix.mixForecastGross - fc.plan.forecastGross) < 0.02,
  'matrix mix sum = club forecast',
)

const dirSum = sumRevenueDirectionForecast(fc.plan.directions)
ok(Math.abs(dirSum - fc.plan.forecastGross) < 0.05, 'directions sum = club forecast')

const cellSum = (fc.plan.purchaseMix.cells ?? []).reduce(
  (s, c) => s + (Number(c.forecastRub) || 0),
  0,
)
ok(
  Math.abs(cellSum + (fc.plan.purchaseMix.dop?.forecast || 0) - fc.plan.forecastGross) < 0.05,
  'matrix cells + dop = club forecast',
)

ok(
  fc.plan.planScenarioGross >= fc.plan.forecastGross - 0.02,
  'plan scenario >= profit pace',
)

const ukRows = [
  {
    report_date: '2026-07-01',
    profit_nk: 50000,
    profit_dk: 80000,
    profit_uk: 10000,
    az_dk: 1,
    matrix_amounts: { pz_nk: 20000, pz_dk: 60000, az_dk: 8000 },
  },
  {
    report_date: '2026-07-02',
    profit_nk: 40000,
    profit_dk: 70000,
    profit_uk: 8000,
    az_dk: 1,
    matrix_amounts: { pz_nk: 10000, pz_dk: 50000, az_dk: 7000 },
  },
  {
    report_date: '2026-07-03',
    profit_nk: 45000,
    profit_dk: 90000,
    profit_uk: 9000,
    az_dk: 1,
    matrix_amounts: { pz_nk: 18000, pz_dk: 70000, az_dk: 9000 },
  },
]
const fcUk = buildClubFinanceForecast({
  monthRows: ukRows,
  year: 2026,
  month: 7,
  expense: 0,
  membershipTypes: [],
  today: new Date(2026, 6, 8),
  planForm: {
    plan_level_3: '420000',
    plan_az_dk_count: '40',
    plan_az_dk_avg: '6500',
  },
})
ok(fcUk.ok, 'uk residual forecast ok')
const ukMatrixFact = fcUk.plan.purchaseMix.cells.reduce((s, c) => s + (Number(c.factRub) || 0), 0)
ok(
  Math.abs((fcUk.plan.purchaseMix.dop?.fact || 0) - (fcUk.plan.factGross - ukMatrixFact)) < 0.02,
  'unmapped profit → dop fact',
)
ok(
  Math.abs((fcUk.plan.purchaseMix.byHall?.az?.forecast || 0) - (fcUk.plan.purchaseMix.cells.find((c) => c.cellKey === 'az_dk')?.forecastRub || 0)) <
    0.02,
  'az hall = az_dk cell (no uk leak)',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll matrix reconcile checks passed')
