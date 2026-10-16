import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
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
