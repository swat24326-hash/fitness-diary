import { buildNutritionPlan, normalizeNutritionSurvey } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import { buildMealFromDish, fillDishParts } from '../src/lib/nutrition/nutritionDishBuildCore.js'
import { pickDishTemplate, templatesForSlot } from '../src/lib/nutrition/nutritionDishTemplatesCore.js'
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { getProductMealRole } from '../src/lib/nutrition/nutritionMealPairingCore.js'
import { resolveCatalogProduct } from '../src/lib/nutrition/nutritionCatalogResolve.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalogMap = buildNutritionCatalogMap([])

ok(templatesForSlot('breakfast').length >= 2, 'breakfast has dish templates')
ok(templatesForSlot('snack_am').every((t) => t.slotKinds.includes('snack')), 'snack templates are snack-kind')
ok(pickDishTemplate('lunch', 0).id, 'pick lunch template')

const pools = {
  protein: ['chicken_breast', 'eggs', 'cottage_cheese_5'],
  fat: ['olive_oil', 'butter', 'nuts_walnut'],
  carbs: ['buckwheat', 'vegetables', 'apple', 'oats', 'potato'],
}

const plate = fillDishParts({
  template: pickDishTemplate('lunch', 0),
  productIdsByGroup: pools,
  catalogMap,
  mealIndex: 0,
})
ok(plate && plate.length >= 2, 'lunch plate fills ≥2 parts')

const cottageTpl = templatesForSlot('snack_am').find((t) => t.id === 'cottage_fruit')
ok(!!cottageTpl, 'cottage_fruit for snack')
const cottageFill = fillDishParts({
  template: cottageTpl,
  productIdsByGroup: pools,
  catalogMap,
  mealIndex: 1,
})
ok(cottageFill?.some((p) => p.productId === 'cottage_cheese_5'), 'cottage dish prefers dairy protein')
ok(cottageFill?.some((p) => getProductMealRole(p.productId, resolveCatalogProduct(catalogMap, p.productId)) === 'fruit'), 'cottage dish has fruit')
ok(!cottageFill?.some((p) => p.productId === 'butter'), 'cottage dish no butter with fruit')

const meal = buildMealFromDish({
  slotId: 'dinner',
  mealIndex: 0,
  mealKcalBudget: 600,
  productIdsByGroup: pools,
  catalogMap,
})
ok(meal?.dishLabel, `dinner dish label: ${meal?.dishLabel}`)
ok((meal?.items?.length ?? 0) >= 2, 'dinner items ≥2')
const dinnerKcal = meal.items.reduce((s, i) => s + (i.kcal ?? 0), 0)
ok(Math.abs(dinnerKcal - 600) <= 600 * 0.12, `dinner kcal near budget (${dinnerKcal})`)

const health = { height_cm: 170, current_weight_kg: 75, weight_kg: 75, sex: 'male' }
const survey = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  exclusions: [],
  pickedProducts: {
    protein: ['chicken_breast', 'eggs', 'cottage_cheese_5'],
    fat: ['olive_oil', 'nuts_walnut', 'butter'],
    carbs: ['buckwheat', 'vegetables', 'apple', 'oats'],
  },
})
const built = buildNutritionPlan(health, survey, catalogMap)
ok(built.ok, `full plan ok: ${built.errors?.join('; ') ?? ''}`)
ok(built.plan?.version === 3, 'plan version 3 (dishes)')
for (const m of built.plan?.dayPlan ?? []) {
  ok(Boolean(m.dishId && m.dishLabel), `${m.label}: has dish`)
  ok((m.items?.length ?? 0) >= 2, `${m.label}: ≥2 items`)
  const roles = m.items.map((it) => getProductMealRole(it.productId, resolveCatalogProduct(catalogMap, it.productId)))
  const hasButter = m.items.some((it) => it.productId === 'butter')
  const hasFruit = roles.includes('fruit')
  ok(!(hasButter && hasFruit), `${m.label}: no butter+fruit`)
}

const gain = normalizeNutritionSurvey({
  ...survey,
  goalKind: 'gain_mass',
  mealsPerDay: 5,
  pickedProducts: survey.pickedProducts,
})
const builtGain = buildNutritionPlan(
  { height_cm: 180, current_weight_kg: 80, weight_kg: 80, sex: 'male' },
  { ...gain, age: 28, activityLevel: 'high', goalKind: 'gain_mass', mealsPerDay: 5, exclusions: [], pickedProducts: survey.pickedProducts },
  catalogMap,
)
ok(builtGain.ok, `5-meal gain plan: ${builtGain.errors?.join('; ') ?? ''}`)
ok(builtGain.plan?.dayPlan?.length === 5, '5 meals')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition dish checks passed')
