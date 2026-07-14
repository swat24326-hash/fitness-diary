import {
  buildPlanMatrixComparison,
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

process.exit(failed > 0 ? 1 : 0)
