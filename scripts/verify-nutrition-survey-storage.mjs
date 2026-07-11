import { defaultNutritionSurvey, nutritionSurveyFromStorage } from '../src/lib/nutrition/nutritionSurveyCore.js'
import { planMatchesSurvey } from '../src/lib/nutrition/nutritionPlanSessionCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(nutritionSurveyFromStorage(null) === null, 'null survey in storage → no defaults on screen')

const partial = nutritionSurveyFromStorage({
  age: 42,
  goalKind: 'lose_weight',
  pickedProducts: { protein: ['eggs'], fat: [], carbs: ['rice'] },
})
ok(partial?.age === 42, 'stored partial survey keeps age')
ok(partial?.mealsPerDay === 4, 'stored partial survey fills meals default')
ok(partial?.activityLevel === 'moderate', 'stored partial survey fills activity default')

const defaults = defaultNutritionSurvey()
const freshCompose = { ...defaults }
ok(freshCompose.age === 30 && freshCompose.mealsPerDay === 4, 'fresh compose uses defaults in memory only')

const savedSurvey = nutritionSurveyFromStorage({
  age: 35,
  activityLevel: 'moderate',
  goalKind: 'lose_weight',
  mealsPerDay: 4,
  exclusions: [],
  pickedProducts: {
    protein: ['chicken_breast'],
    fat: ['olive_oil'],
    carbs: ['buckwheat'],
  },
})

let editingSurvey = { ...savedSurvey, mealsPerDay: 5 }
editingSurvey = { ...editingSurvey, age: 36 }
ok(editingSurvey.mealsPerDay === 5 && editingSurvey.age === 36, 'step navigation keeps prior answers')

const draftPlan = { builtSurveyKey: 'k1', totals: { kcal: 2000 } }
ok(planMatchesSurvey(draftPlan, savedSurvey) === false, 'draft key mismatch blocks save without rebuild')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition survey storage / page-flow checks passed.')
