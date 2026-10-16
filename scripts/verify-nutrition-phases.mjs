/**
 * Фазы 2–7: смена блюда, неделя, акцент, rescale, авто-push.
 */
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { buildNutritionPlan } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import { buildNutritionWeekPlan, daysAreDistinct, pickWeekDayPlan } from '../src/lib/nutrition/nutritionWeekPlanCore.js'
import { swapMealInPlan } from '../src/lib/nutrition/nutritionMealSwapCore.js'
import { orderProteinIdsByAccent, proteinAccentForWeek } from '../src/lib/nutrition/nutritionProteinAccentCore.js'
import { rescaleNutritionPlanToHealth } from '../src/lib/nutrition/nutritionPlanRescaleCore.js'
import { shouldAutoPushNutritionPlan } from '../src/lib/nutrition/nutritionAutoPushCore.js'
import { NUTRITION_PRODUCT_CATALOG } from '../src/lib/nutrition/nutritionProductCatalog.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalog = buildNutritionCatalogMap([])
const health = { height_cm: 170, weight_kg: 75, sex: 'male', goal: 'форма' }
const survey = {
  age: 30,
  activityLevel: 'moderate',
  goalKind: 'lose',
  mealsPerDay: 4,
  exclusions: [],
  productSelectMode: 'avoid',
  avoidProductIds: [],
  proteinAccent: 'chicken',
  daysCount: 1,
}

const one = buildNutritionPlan(health, survey, catalog)
ok(one.ok, 'single day builds')
ok(one.plan?.dayPlan?.length === 4, '4 meals')

const swap = swapMealInPlan(one.plan, one.plan.dayPlan[0].slot, { survey, catalogMap: catalog })
ok(swap.ok, 'swap meal ok')
ok(
  swap.plan.dayPlan[0].dishId !== one.plan.dayPlan[0].dishId ||
    swap.plan.dayPlan[0].dishLabel !== one.plan.dayPlan[0].dishLabel ||
    (swap.plan.dayPlan[0].optionOffset ?? 0) !== (one.plan.dayPlan[0].optionOffset ?? 0),
  'swap changes option',
)

const week = buildNutritionWeekPlan(health, { ...survey, daysCount: 5, proteinAccent: 'fish' }, catalog)
ok(week.ok, 'week plan builds')
ok(week.plan?.days?.length === 5, '5 days')
ok(week.plan.weekDistinct === true || daysAreDistinct(week.plan.days), 'days distinct')
const day2 = pickWeekDayPlan(week.plan, 2)
ok(day2.dayPlan?.length > 0, 'pick day 2')

const ordered = orderProteinIdsByAccent(
  ['beef_lean', 'chicken_breast', 'fish_white'],
  'chicken',
)
ok(ordered[0] === 'chicken_breast', 'accent chicken first')
ok(proteinAccentForWeek(['chicken', 'fish'], '2026-01-05', '2026-01-12') === 'fish', 'week rotation')

const heavy = { ...health, weight_kg: 90 }
const scaled = rescaleNutritionPlanToHealth(one.plan, heavy, survey, catalog)
ok(scaled.ok, 'rescale ok')
ok(scaled.plan.kcalTarget !== one.plan.kcalTarget, 'kcal target changed with weight')
ok(scaled.plan.dayPlan[0].dishId === one.plan.dayPlan[0].dishId, 'dish kept after rescale')

ok(
  shouldAutoPushNutritionPlan({
    enabled: true,
    health: heavy,
    plan: scaled.plan,
    planUnsaved: false,
    trigger: 'manual_recalc',
  }).shouldPush,
  'auto push after recalc',
)
ok(
  !shouldAutoPushNutritionPlan({
    enabled: false,
    health,
    plan: one.plan,
    planUnsaved: false,
    trigger: 'manual_recalc',
  }).shouldPush,
  'auto push off when disabled',
)

ok(NUTRITION_PRODUCT_CATALOG.length >= 50, `catalog ${NUTRITION_PRODUCT_CATALOG.length}`)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition phase checks passed')
