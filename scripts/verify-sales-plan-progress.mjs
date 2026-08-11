import {
  PLAN_MILESTONE_MIN_GAP_PERCENT,
  buildPlanMilestoneVisual,
  buildPlanProgressVisual,
  spreadMilestoneLeftPercents,
} from '../src/lib/admin/salesPlanProgress.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const empty = buildPlanProgressVisual(0)
ok(empty.fillPercent === 0, '0% empty fill')
ok(empty.overflow === false, '0% not overflow')

const half = buildPlanProgressVisual(50)
ok(half.fillPercent === 50, '50% half fill')

const full = buildPlanProgressVisual(100)
ok(full.fillPercent === 100, '100% full fill')
ok(full.overflow === false, '100% not overflow')

const over = buildPlanProgressVisual(150)
ok(over.overflow === true, '150% overflow flag')
ok(over.fillPercent === 100, '150% bar capped at 100')
ok(over.overflowPercent === 50, '150% overflow delta')

const spaced = spreadMilestoneLeftPercents([33.3, 66.7, 100])
ok(
  spaced[0] === 33.3 && spaced[1] === 66.7 && spaced[2] === 100,
  'spread keeps well-spaced milestones',
)

const clustered = spreadMilestoneLeftPercents([97.8, 98.9, 100])
ok(clustered[2] === 100, 'cluster final stays at 100')
ok(clustered[1] <= clustered[2] - PLAN_MILESTONE_MIN_GAP_PERCENT + 0.01, 'cluster L2 gap from final')
ok(clustered[0] <= clustered[1] - PLAN_MILESTONE_MIN_GAP_PERCENT + 0.01, 'cluster L1 gap from L2')

const vessel = buildPlanMilestoneVisual(60076, {
  level1: 4_500_000,
  level2: 4_550_000,
  level3: 4_600_000,
})
ok(vessel.milestones.length === 3, 'milestone visual has 3 markers')
ok(vessel.milestones[2].leftPercent === 100, 'visual final at 100%')
ok(
  vessel.milestones[1].leftPercent <= vessel.milestones[2].leftPercent - PLAN_MILESTONE_MIN_GAP_PERCENT + 0.01,
  'close plans: markers visually separated',
)
ok(vessel.milestones[0].trueLeftPercent > 97, 'true position still near end')
ok(vessel.milestones[0].leftPercent < 90, 'display position pulled left so tags readable')

process.exit(failed > 0 ? 1 : 0)
