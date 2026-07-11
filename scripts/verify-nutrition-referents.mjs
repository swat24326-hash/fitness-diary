import { buildNutritionPlan, normalizeNutritionSurvey } from '../src/lib/nutrition/nutritionPlanBuilder.js'
import {
  computeNutritionReferents,
  isWithinReferentBand,
  macroTargetsFromReferents,
} from '../src/lib/nutrition/nutritionReferentsCore.js'

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

const referents = computeNutritionReferents({
  sex: 'male',
  age: 35,
  weightKg: 75,
  heightCm: 170,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
})

ok(referents != null, 'referents computed')
ok(referents.kcal.aim <= referents.kcal.max, 'kcal aim not above max')
ok(referents.kcal.aim >= referents.kcal.min, 'kcal aim not below min')
ok(referents.protein.aim === Math.round(1.6 * 75), 'protein aim lower bound 1.6 g/kg')

const macros = macroTargetsFromReferents(referents)
ok(macros.proteinG === referents.protein.aim, 'macro targets use referent aim')

const built = buildNutritionPlan(health, survey)
ok(built.ok, `plan builds: ${built.errors?.join('; ') ?? ''}`)
ok(built.plan?.referents?.kcal?.aim === referents.kcal.aim, 'plan stores referents')
ok(built.plan?.kcalTarget === referents.kcal.aim, 'kcal target is referent aim')

const totals = built.plan?.totals
ok(isWithinReferentBand(totals.kcal, referents.kcal), `kcal ${totals.kcal} in ${referents.kcal.min}-${referents.kcal.max}`)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition referents checks passed.')
