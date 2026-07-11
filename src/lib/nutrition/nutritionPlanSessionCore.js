/**
 * Снимок опросника для проверки, что черновик рациона собран из текущих ответов.
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 */
export function surveyBuildKey(survey) {
  const pp = survey?.pickedProducts ?? {}
  return JSON.stringify({
    age: survey?.age ?? null,
    activityLevel: survey?.activityLevel ?? null,
    goalKind: survey?.goalKind ?? null,
    mealsPerDay: survey?.mealsPerDay ?? null,
    exclusions: [...(survey?.exclusions ?? [])].sort(),
    pickedProducts: {
      protein: [...(pp.protein ?? [])].sort(),
      fat: [...(pp.fat ?? [])].sort(),
      carbs: [...(pp.carbs ?? [])].sort(),
    },
  })
}

/**
 * @param {object | null | undefined} plan
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 */
export function planMatchesSurvey(plan, survey) {
  if (!plan) return false
  const key = surveyBuildKey(survey)
  if (!plan.builtSurveyKey) return false
  return plan.builtSurveyKey === key
}

/**
 * @param {object} plan
 * @param {import('./nutritionPlanBuilder.js').NutritionSurvey} survey
 */
export function attachSurveyKeyToPlan(plan, survey) {
  return { ...plan, builtSurveyKey: surveyBuildKey(survey) }
}
