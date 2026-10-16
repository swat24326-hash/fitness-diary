/**
 * Качество рациона: эргономика опросника (seed из анкеты) + продукт лучше «типичного GPT».
 * Эталон человека: женщина 32 г., 65 кг, 168 см, снижение веса, средняя активность, 4 приёма, неделя.
 */
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { buildNutritionPlan } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import { buildNutritionWeekPlan, daysAreDistinct } from '../src/lib/nutrition/nutritionWeekPlanCore.js'
import { assessTotalsAgainstReferents } from '../src/lib/nutrition/nutritionReferentsCore.js'
import { defaultNutritionSurvey } from '../src/lib/nutrition/nutritionSurveyCore.js'
import {
  nutritionAgeFromClient,
  nutritionGoalKindFromHealth,
  seedNutritionSurveyFromClientHealth,
} from '../src/lib/nutrition/nutritionSurveySeedCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const BANNED_STEP = /до мягкости|блендер|по вкусу посолите|на сковороде салат/i

// --- 1. Эргономика: не дублируем возраст и цель ---
const client = { birth_date: '1994-03-15' }
const health = {
  height_cm: 168,
  weight_kg: 65,
  current_weight_kg: 65,
  sex: 'female',
  goal: 'Снижение веса — минус 5 кг',
}
const asOf = '2026-10-16'
ok(nutritionAgeFromClient(client, asOf) === 32, `age from birth_date → 32 (got ${nutritionAgeFromClient(client, asOf)})`)
ok(nutritionGoalKindFromHealth(health) === 'lose_weight', 'goal from health → lose_weight')
ok(nutritionGoalKindFromHealth({ goal: 'Набор мышечной массы' }) === 'gain_mass', 'muscle → gain_mass')
ok(nutritionGoalKindFromHealth({ goal: 'Выносливость' }) === 'endurance', 'endurance maps')

const seeded = seedNutritionSurveyFromClientHealth(defaultNutritionSurvey(), {
  client,
  health,
  asOfIso: asOf,
  forceGoal: true,
})
ok(seeded.age === 32, 'seed survey.age from ДР')
ok(seeded.goalKind === 'lose_weight', 'seed survey.goalKind from health')

const keepCustom = seedNutritionSurveyFromClientHealth(
  { ...defaultNutritionSurvey(), goalKind: 'gain_mass', age: 40 },
  { client, health, asOfIso: asOf, forceGoal: false },
)
ok(keepCustom.goalKind === 'gain_mass', 'без forceGoal сохраняем выбранную цель питания')
ok(keepCustom.age === 32, 'возраст всё равно обновляем из ДР')

ok(nutritionAgeFromClient({ birth_date: null }, asOf) == null, 'нет ДР → возраста нет')

// --- 2. Продукт: рацион в референтах, рецепты человеческие, неделя разная ---
const catalog = buildNutritionCatalogMap([])
const survey = {
  ...seeded,
  activityLevel: 'moderate',
  mealsPerDay: 4,
  daysCount: 7,
  exclusions: [],
  productSelectMode: 'avoid',
  avoidProductIds: [],
  proteinAccent: 'mixed',
}

const day = buildNutritionPlan(health, survey, catalog)
ok(day.ok, `build day: ${day.errors?.join('; ') ?? 'ok'}`)
const plan = day.plan
const check = assessTotalsAgainstReferents(plan.totals, plan.referents)
ok(check?.kcal, `ккал в референтах (got ${JSON.stringify(check)})`)
const macrosIn = [check?.protein, check?.fat, check?.carbs].filter(Boolean).length
ok(macrosIn >= 2, `≥2 из БЖУ в референтах (got ${macrosIn}: ${JSON.stringify(check)})`)

const recipeMeals = (plan.dayPlan ?? []).filter((m) => m.prep === 'recipe' || m.source === 'recipe')
ok(recipeMeals.length >= 1, `есть блюдо с рецептом (got ${recipeMeals.length})`)

let stepsOk = 0
let bannedHit = null
for (const meal of plan.dayPlan ?? []) {
  const steps = Array.isArray(meal.recipeSteps) ? meal.recipeSteps.filter(Boolean) : []
  if (!steps.length) continue
  if (steps.length >= 2) stepsOk++
  for (const s of steps) {
    if (BANNED_STEP.test(String(s))) bannedHit = String(s)
  }
}
ok(stepsOk >= 1, `рецепт ≥2 шагов (got ${stepsOk})`)
ok(!bannedHit, bannedHit ? `запрещённая формулировка: ${bannedHit}` : 'без няньских формулировок')

const week = buildNutritionWeekPlan(health, survey, catalog)
ok(week.ok && week.plan?.days?.length === 7, `неделя 7 дн. (got ${week.plan?.days?.length})`)
ok(daysAreDistinct(week.plan?.days ?? []), 'дни недели не копии')

// --- 3. Лучше «типичного GPT»: ближе к цели ккал, чем плоская тарелка 1800 ---
const aim = plan.referents?.kcal?.aim ?? plan.kcalTarget
const ourDelta = Math.abs((plan.totals?.kcal ?? 0) - aim)
const naiveGptKcal = 1800
const gptDelta = Math.abs(naiveGptKcal - aim)
ok(ourDelta <= gptDelta, `к цели ближе нас (${ourDelta}) чем GPT-1800 (${gptDelta}), aim=${aim}`)
ok(ourDelta <= Math.max(80, aim * 0.06), `попадание в ~6% цели (delta=${ourDelta}, aim=${aim})`)

const hasNamedDish = (plan.dayPlan ?? []).some((m) => String(m.dishLabel ?? '').trim().length > 3)
ok(hasNamedDish, 'есть именные блюда, не только «белок+гарнир»')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nok: nutrition quality')
