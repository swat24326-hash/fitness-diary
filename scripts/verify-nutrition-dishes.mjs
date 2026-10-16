import { buildNutritionPlan, normalizeNutritionSurvey } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import { buildMealFromDish, fillDishParts } from '../src/lib/nutrition/nutritionDishBuildCore.js'
import { pickDishTemplate, templatesForSlot } from '../src/lib/nutrition/nutritionDishTemplatesCore.js'
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { getProductMealRole } from '../src/lib/nutrition/nutritionMealPairingCore.js'
import { resolveCatalogProduct } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { preferProteinsForSlotKind } from '../src/lib/nutrition/nutritionMealSlotFoodCore.js'

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
ok(templatesForSlot('breakfast').every((t) => !['protein_starch_salad', 'protein_potato'].includes(t.id)), 'breakfast without dinner plates')
ok(templatesForSlot('snack_am').every((t) => t.slotKinds.includes('snack')), 'snack templates are snack-kind')
ok(pickDishTemplate('lunch', 0).id, 'pick lunch template')

const pools = {
  protein: ['chicken_breast', 'eggs', 'cottage_cheese_5', 'beef_lean'],
  fat: ['olive_oil', 'butter', 'nuts_walnut'],
  carbs: ['buckwheat', 'vegetables', 'apple', 'oats', 'potato', 'bread_whole'],
}

const plate = fillDishParts({
  template: pickDishTemplate('lunch', 0),
  productIdsByGroup: pools,
  catalogMap,
  mealIndex: 0,
  slotKind: 'lunch',
})
ok(plate && plate.length >= 2, 'lunch plate fills ≥2 parts')
ok(plate?.some((p) => ['chicken_breast', 'beef_lean'].includes(p.productId)), 'lunch prefers meat protein')

const breakfastMeal = buildMealFromDish({
  slotId: 'breakfast',
  mealIndex: 0,
  mealKcalBudget: 500,
  productIdsByGroup: pools,
  catalogMap,
})
ok(breakfastMeal?.dishId, `breakfast dish: ${breakfastMeal?.dishLabel}`)
ok(!['protein_starch_salad', 'protein_potato'].includes(breakfastMeal?.dishId), 'breakfast not dinner-style plate')
const bfProtein = breakfastMeal?.items?.find((it) =>
  ['eggs', 'cottage_cheese_5', 'cottage_cheese_0', 'yogurt', 'kefir'].includes(it.productId),
)
ok(Boolean(bfProtein), `breakfast protein is dairy/eggs (${bfProtein?.label ?? 'none'})`)
ok(!breakfastMeal?.items?.some((it) => it.productId === 'beef_lean'), 'breakfast without beef')
ok(
  preferProteinsForSlotKind(['beef_lean', 'eggs'], 'breakfast', catalogMap).includes('eggs'),
  'prefer eggs over beef for breakfast',
)

const cottageTpl = templatesForSlot('snack_am').find((t) => t.id === 'cottage_fruit')
ok(!!cottageTpl, 'cottage_fruit for snack')
const cottageFill = fillDishParts({
  template: cottageTpl,
  productIdsByGroup: pools,
  catalogMap,
  mealIndex: 1,
  slotKind: 'snack',
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
ok(built.plan?.version === 5, 'plan version 5 (dishes + recipes)')
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

// Клубные UUID без meal_role (как на планшете после старого seed) — перекус не должен падать.
const clubRows = [
  { id: 'u-chicken', club_id: 'c1', label: 'Куриная грудка', macro_group: 'protein', protein_per100: 23, fat_per100: 2, carbs_per100: 0, tags: [], is_active: true },
  { id: 'u-cottage', club_id: 'c1', label: 'Творог 5%', macro_group: 'protein', protein_per100: 17, fat_per100: 5, carbs_per100: 2, tags: [], is_active: true },
  { id: 'u-oil', club_id: 'c1', label: 'Оливковое масло', macro_group: 'fat', protein_per100: 0, fat_per100: 100, carbs_per100: 0, tags: [], is_active: true },
  { id: 'u-nuts', club_id: 'c1', label: 'Грецкий орех', macro_group: 'fat', protein_per100: 15, fat_per100: 65, carbs_per100: 7, tags: [], is_active: true },
  { id: 'u-buck', club_id: 'c1', label: 'Гречка (варёная)', macro_group: 'carbs', protein_per100: 4, fat_per100: 1, carbs_per100: 21, tags: [], is_active: true },
  { id: 'u-apple', club_id: 'c1', label: 'Яблоко', macro_group: 'carbs', protein_per100: 0.3, fat_per100: 0.2, carbs_per100: 14, tags: [], is_active: true },
  { id: 'u-banana', club_id: 'c1', label: 'Банан', macro_group: 'carbs', protein_per100: 1, fat_per100: 0.3, carbs_per100: 23, tags: [], is_active: true },
  { id: 'u-oats', club_id: 'c1', label: 'Овсянка (сухая)', macro_group: 'carbs', protein_per100: 13, fat_per100: 6, carbs_per100: 62, tags: [], is_active: true },
  { id: 'u-veg', club_id: 'c1', label: 'Овощи (салат)', macro_group: 'carbs', protein_per100: 1.5, fat_per100: 0.2, carbs_per100: 5, tags: [], is_active: true },
]
const clubMap = buildNutritionCatalogMap(clubRows)
ok(getProductMealRole('u-apple', resolveCatalogProduct(clubMap, 'u-apple')) === 'fruit', 'club apple enriched → fruit')
ok(getProductMealRole('u-nuts', resolveCatalogProduct(clubMap, 'u-nuts')) === 'nut_fat', 'club nuts enriched → nut_fat')

const clubSurvey = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  exclusions: [],
  pickedProducts: {
    protein: ['u-chicken', 'u-cottage'],
    fat: ['u-oil', 'u-nuts'],
    carbs: ['u-buck', 'u-apple', 'u-banana', 'u-oats', 'u-veg'],
  },
})
const clubBuilt = buildNutritionPlan(health, clubSurvey, clubMap)
ok(clubBuilt.ok, `club UUID catalog plan: ${clubBuilt.errors?.join('; ') ?? ''}`)
const snackMeal = clubBuilt.plan?.dayPlan?.find((m) => String(m.slot).includes('snack') || m.label === 'Перекус')
ok(Boolean(snackMeal?.dishId), `snack assembled: ${snackMeal?.dishLabel ?? 'none'}`)

// Без фруктов в названии — только гарниры: запасной protein_carb_snack
const starchOnlyRows = clubRows.filter((r) => !['Яблоко', 'Банан'].includes(r.label))
const starchMap = buildNutritionCatalogMap(starchOnlyRows)
const starchSurvey = normalizeNutritionSurvey({
  ...clubSurvey,
  pickedProducts: {
    protein: ['u-chicken', 'u-cottage'],
    fat: ['u-oil'],
    carbs: ['u-buck', 'u-oats', 'u-veg'],
  },
})
const starchBuilt = buildNutritionPlan(health, starchSurvey, starchMap)
ok(starchBuilt.ok, `no-fruit snack fallback: ${starchBuilt.errors?.join('; ') ?? ''}`)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition dish checks passed')
