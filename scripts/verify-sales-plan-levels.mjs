import { buildPlanMilestoneVisual, buildPlanProgressVisual } from '../src/lib/admin/salesPlanProgress.js'
import {
  planFormToPayload,
  resolveAchievedPlanLevel,
  resolvePlanFinalTarget,
  resolvePlanTotal,
} from '../src/lib/admin/salesReportCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(buildPlanProgressVisual(0).fillPercent === 0, '0% empty fill')

ok(
  resolvePlanFinalTarget({ plan_level_1: 1_000_000, plan_level_2: 1_100_000, plan_level_3: 1_200_000 }) ===
    1_200_000,
  'final target is level 3 not sum',
)
ok(resolvePlanTotal({ plan_total: 5000 }) === 5000, 'legacy plan_total when levels empty')

const parsed = planFormToPayload({
  plan_level_1: '1000000',
  plan_level_2: '1100000',
  plan_level_3: '1200000',
  plan_pz: '400000',
  plan_tz: '400000',
  plan_az: '400000',
})
ok(parsed.ok === true, 'plan payload ok when directions match final')
ok(parsed.payload.plan_total === 1200000, 'plan_total stored as level 3')

const badOrder = planFormToPayload({
  plan_level_1: '1200000',
  plan_level_2: '1000000',
  plan_level_3: '1100000',
})
ok(badOrder.ok === false, 'reject level 2 below level 1')

const milestone = buildPlanMilestoneVisual(1_050_000, {
  level1: 1_000_000,
  level2: 1_100_000,
  level3: 1_200_000,
})
ok(milestone.milestones.length === 3, 'three milestones on scale')
ok(milestone.milestones[0].leftPercent < milestone.milestones[1].leftPercent, 'milestones ascending on bar')
ok(milestone.achievedLevel === 1, 'fact 1.05M achieves level 1 only')
ok(
  resolveAchievedPlanLevel(1_150_000, { level1: 1_000_000, level2: 1_100_000, level3: 1_200_000 }) === 2,
  'achieved level 2',
)
ok(Math.round(milestone.milestones[2].leftPercent) === 100, 'level 3 marker at 100%')

process.exit(failed > 0 ? 1 : 0)
