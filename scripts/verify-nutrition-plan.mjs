import { buildNutritionPlan, normalizeNutritionSurvey } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import { mealSlotsRatiosSum, getMealSlots } from '../src/lib/nutrition/nutritionMealSlotsCore.js'
import {
  computeBmr,
  computeKcalTarget,
  computeMacroTargets,
  computeTdee,
  roundGrams,
} from '../src/lib/nutrition/nutritionMacrosCore.js'
import { filterNutritionProductsByExclusions } from '../src/lib/nutrition/nutritionProductCatalog.js'
import { isNutritionHealthReady } from '../src/lib/nutrition/nutritionPlanBuilder.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const health = { height_cm: 170, current_weight_kg: 75, weight_kg: 75, sex: 'male', goal: 'снижение' }
const survey = normalizeNutritionSurvey({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  exclusions: [],
  pickedProducts: {
    protein: ['chicken_breast', 'eggs'],
    fat: ['olive_oil', 'nuts_walnut'],
    carbs: ['buckwheat', 'vegetables', 'apple'],
  },
})

ok(isNutritionHealthReady(health), 'health ready')

const bmrHeavy = computeBmr({ sex: 'male', age: 35, weightKg: 85, heightCm: 170 })
const bmrLight = computeBmr({ sex: 'male', age: 35, weightKg: 75, heightCm: 170 })
ok(bmrHeavy - bmrLight === 100, '10 kg → +100 kcal BMR')
const targetHeavy = computeKcalTarget(computeTdee(bmrHeavy, 'moderate'), 'lose_weight')
const targetLight = computeKcalTarget(computeTdee(bmrLight, 'moderate'), 'lose_weight')
ok(targetHeavy - targetLight >= 80, `10 kg affects kcal target (${targetHeavy - targetLight})`)

const bmr = computeBmr({ sex: 'male', age: 35, weightKg: 75, heightCm: 170 })
ok(bmr > 1500 && bmr < 2000, `bmr plausible ${bmr}`)
const tdee = computeTdee(bmr, 'moderate')
ok(tdee > bmr, 'tdee > bmr')
const kcal = computeKcalTarget(tdee, 'lose_weight')
ok(kcal < tdee, 'lose weight below tdee')
const macros = computeMacroTargets(kcal, 'lose_weight')
ok(macros.proteinG > 0 && macros.fatG > 0 && macros.carbsG > 0, 'macros positive')

ok(Math.abs(mealSlotsRatiosSum(4) - 1) < 0.001, '4 meals ratios sum 1')
ok(getMealSlots(4).length === 4, '4 meal slots')

const filtered = filterNutritionProductsByExclusions(['cottage_cheese_5', 'bread_whole'], ['lactose'])
ok(!filtered.includes('cottage_cheese_5'), 'lactose exclusion')
ok(filtered.includes('bread_whole'), 'bread kept')

ok(roundGrams(47) === 45 || roundGrams(47) === 50, 'round grams to 5')

const built = buildNutritionPlan(health, survey)
ok(built.ok, `plan builds: ${built.errors?.join('; ') ?? ''}`)
ok(built.plan?.dayPlan?.length === 4, 'day plan 4 meals')
ok(built.plan?.totals?.kcal > 0, 'totals kcal')
const target = built.plan?.kcalTarget ?? 0
const actual = built.plan?.totals?.kcal ?? 0
ok(Math.abs(actual - target) <= target * 0.1, `totals within 10% of target (${actual} vs ${target})`)
ok(built.plan?.basis?.weightKg === 75, 'plan stores basis weight')
for (const meal of built.plan?.dayPlan ?? []) {
  ok(meal.items.length >= 2, `${meal.label} has items`)
  ok(meal.subtotal.kcal > 0, `${meal.label} subtotal`)
}

process.exit(failed > 0 ? 1 : 0)
