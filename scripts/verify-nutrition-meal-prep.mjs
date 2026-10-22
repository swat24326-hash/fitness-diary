/**
 * База vs рецепт + добор ккал лучше «нейронки».
 */
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { buildNutritionPlan } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import { buildNutritionWeekPlan } from '../src/lib/nutrition/nutritionWeekPlanCore.js'
import {
  countPrepInModes,
  mealPrepModesForDay,
  recipeSlotsPerDay,
} from '../src/lib/nutrition/nutritionMealPrepCore.js'
import { topUpMealItemsToBudget } from '../src/lib/nutrition/nutritionMealTopUpCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(recipeSlotsPerDay(4) === 2, '4 meals → 2 recipes')
ok(recipeSlotsPerDay(3) === 1, '3 meals → 1 recipe')
ok(mealPrepModesForDay(2, 0).length === 2 && mealPrepModesForDay(2, 0).filter((m) => m === 'recipe').length === 1, '2 приёма — один рецепт')

const m0 = mealPrepModesForDay(4, 0)
const c0 = countPrepInModes(m0)
ok(c0.recipe === 2 && c0.base === 2, `day0 mask 2+2: ${m0.join(',')}`)
ok(mealPrepModesForDay(4, 1).join(',') !== m0.join(','), 'day1 mask rotates')

const catalog = buildNutritionCatalogMap([])
const health = { height_cm: 180, weight_kg: 100, sex: 'male', goal: 'набрать' }
const survey = {
  age: 30,
  activityLevel: 'moderate',
  goalKind: 'maintain',
  mealsPerDay: 4,
  exclusions: [],
  productSelectMode: 'avoid',
  avoidProductIds: [],
  proteinAccent: 'chicken',
  daysCount: 3,
}

const one = buildNutritionPlan(health, survey, catalog)
ok(one.ok, `plan builds: ${one.errors?.join('; ') ?? ''}`)
const recipes = (one.plan?.dayPlan ?? []).filter((m) => m.prep === 'recipe')
const bases = (one.plan?.dayPlan ?? []).filter((m) => m.prep === 'base')
ok(recipes.length === 2, `2 recipes got ${recipes.length}`)
ok(bases.length === 2, `2 base got ${bases.length}`)

const target = one.plan.kcalTarget
const fact = one.plan.totals.kcal
ok(fact >= target * 0.85, `kcal near target (fact ${fact} vs ${target}) — better than neural under-eat`)
ok(
  one.plan.totals.proteinG >= (one.plan.macros?.proteinG ?? 0) * 0.85,
  `protein near aim (${one.plan.totals.proteinG} vs ${one.plan.macros?.proteinG})`,
)
ok(
  one.plan.totals.proteinG <= (one.plan.macros?.proteinG ?? 0) * 2.2,
  `protein not absurdly over (${one.plan.totals.proteinG} vs aim ${one.plan.macros?.proteinG})`,
)

for (const m of one.plan.dayPlan) {
  ok(m.subtotal?.kcal > 0, `КБЖУ after ${m.label}: ${m.subtotal.kcal} ккал`)
}

const week = buildNutritionWeekPlan(health, { ...survey, daysCount: 3 }, catalog)
ok(week.ok, '3-day week')
ok(week.plan?.days?.length === 3, '3 days')
for (const d of week.plan.days) {
  const r = (d.dayPlan ?? []).filter((m) => m.prep === 'recipe').length
  ok(r === 2, `${d.label}: 2 recipes (got ${r})`)
  ok(d.totals.kcal >= (d.kcalTarget ?? target) * 0.8, `${d.label} kcal not collapsed`)
}

const tiny = [
  { productId: 'chicken_breast', label: 'Куриная грудка', grams: 80, kcal: 88, proteinG: 18, fatG: 1, carbsG: 0 },
  { productId: 'rice', label: 'Рис', grams: 80, kcal: 104, proteinG: 2, fatG: 0, carbsG: 22 },
]
const topped = topUpMealItemsToBudget(tiny, 500, catalog, { preferProtein: true })
const toppedKcal = topped.reduce((s, i) => s + (i.kcal ?? 0), 0)
ok(toppedKcal > 200, `top-up raises meal kcal (${toppedKcal})`)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition meal-prep checks passed')
