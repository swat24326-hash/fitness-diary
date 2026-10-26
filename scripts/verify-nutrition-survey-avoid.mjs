import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import {
  foodCategoryAvoidStats,
  setCategoryAvoided,
} from '../src/lib/nutrition/nutritionFoodCategoriesCore.js'
import { buildNutritionPlan, normalizeNutritionSurvey } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import {
  resolveProductSelectMode,
  resolveSurveyProductPools,
} from '../src/lib/nutrition/nutritionSurveyProductsCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalog = buildNutritionCatalogMap([])
const health = { height_cm: 170, current_weight_kg: 75, weight_kg: 75, sex: 'male' }

const avoidSurvey = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  productSelectMode: 'avoid',
  avoidProductIds: ['fish_white', 'salmon', 'cottage_cheese_5', 'cottage_cheese_0'],
  exclusions: [],
  pickedProducts: { protein: [], fat: [], carbs: [] },
})
ok(resolveProductSelectMode(avoidSurvey) === 'avoid', 'mode avoid')
const pools = resolveSurveyProductPools(avoidSurvey, catalog)
ok(!pools.protein.includes('fish_white'), 'fish avoided')
ok(!pools.protein.includes('cottage_cheese_5'), 'cottage avoided')
ok(pools.protein.includes('chicken_breast'), 'chicken still in pool')
ok(pools.fat.length > 0 && pools.carbs.length > 0, 'fat/carbs pools non-empty')

const built = buildNutritionPlan(health, avoidSurvey, catalog)
ok(built.ok, `avoid-mode plan: ${built.errors?.join('; ') ?? ''}`)

const emptyAvoid = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'maintain',
  mealsPerDay: 4,
  productSelectMode: 'avoid',
  avoidProductIds: [],
  exclusions: [],
})
ok(resolveProductSelectMode(emptyAvoid) === 'avoid', 'empty = avoid all catalog')
const allPools = resolveSurveyProductPools(emptyAvoid, catalog)
ok(allPools.protein.length > 8, `full protein pool ${allPools.protein.length}`)
ok(buildNutritionPlan(health, emptyAvoid, catalog).ok, 'plan with zero avoids')

// «Не ем рыбу» — цель ккал и белок не должны проседать; рыбы в тарелке нет.
const sea = foodCategoryAvoidStats({
  categoryId: 'seafood',
  avoidProductIds: [],
  exclusions: [],
  catalogMap: catalog,
})
const avoidFishIds = setCategoryAvoided([], sea.toggleableIds, true)
const noFishSurvey = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  productSelectMode: 'avoid',
  avoidProductIds: avoidFishIds,
  exclusions: [],
})
const noFish = buildNutritionPlan(health, noFishSurvey, catalog)
ok(noFish.ok, `no-fish plan: ${noFish.errors?.join('; ') ?? ''}`)
const noFishFoods = (noFish.plan?.dayPlan ?? []).flatMap((m) => m.items ?? [])
ok(
  !noFishFoods.some((i) => /рыб|минтай|лосос|тунец|сёмг/i.test(String(i.label ?? ''))),
  'no fish labels in plan',
)
ok(!noFishFoods.some((i) => avoidFishIds.includes(String(i.productId))), 'avoided seafood ids not in plan')
const aimK = noFish.plan?.kcalTarget ?? 0
const aimP = noFish.plan?.macros?.proteinG ?? 0
ok(aimK > 0 && noFish.plan.totals.kcal >= aimK * 0.92, `no-fish kcal near aim (${noFish.plan.totals.kcal}/${aimK})`)
ok(aimP > 0 && noFish.plan.totals.proteinG >= aimP * 0.9, `no-fish protein near aim (${noFish.plan.totals.proteinG}/${aimP})`)

const withFishSurvey = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  productSelectMode: 'avoid',
  avoidProductIds: [],
  exclusions: [],
})
const withFish = buildNutritionPlan(health, withFishSurvey, catalog)
ok(withFish.ok, 'baseline with fish allowed')
ok(
  Math.abs(noFish.plan.totals.kcal - withFish.plan.totals.kcal) <= Math.max(150, aimK * 0.08),
  `avoid fish does not collapse kcal vs baseline (Δ ${Math.abs(noFish.plan.totals.kcal - withFish.plan.totals.kcal)})`,
)
ok(
  noFish.plan.totals.proteinG >= withFish.plan.totals.proteinG * 0.85,
  `avoid fish does not collapse protein vs baseline (${noFish.plan.totals.proteinG} vs ${withFish.plan.totals.proteinG})`,
)

const legacyPick = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'maintain',
  mealsPerDay: 4,
  pickedProducts: {
    protein: ['chicken_breast', 'eggs'],
    fat: ['sunflower_oil'],
    carbs: ['buckwheat', 'apple'],
  },
})
ok(resolveProductSelectMode(legacyPick) === 'pick', 'legacy picks → pick mode')
ok(resolveSurveyProductPools(legacyPick, catalog).protein.length === 2, 'legacy protein pool size')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition survey-avoid checks passed')
