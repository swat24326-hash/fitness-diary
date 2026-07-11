import { planMatchesSurvey, surveyBuildKey, attachSurveyKeyToPlan, isDraftStaleForSurvey } from '../src/lib/nutrition/nutritionPlanSessionCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const surveyA = {
  age: 30,
  activityLevel: 'moderate',
  goalKind: 'maintain',
  mealsPerDay: 4,
  exclusions: [],
  pickedProducts: { protein: ['eggs'], fat: ['olive_oil'], carbs: ['rice'] },
}

const surveyB = { ...surveyA, mealsPerDay: 5 }

const plan = attachSurveyKeyToPlan({ totals: { kcal: 2000 } }, surveyA)

ok(planMatchesSurvey(plan, surveyA), 'plan matches same survey')
ok(!planMatchesSurvey(plan, surveyB), 'plan rejects changed survey')
ok(isDraftStaleForSurvey(plan, surveyB), 'draft stale after survey change')
ok(!isDraftStaleForSurvey(plan, surveyA), 'draft fresh for same survey')
ok(surveyBuildKey({ ...surveyA, pickedProducts: { protein: ['eggs', 'chicken_breast'], fat: [], carbs: [] } }) !== surveyBuildKey(surveyA), 'product order stable in key')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition plan session checks passed.')
