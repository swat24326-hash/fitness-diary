import { normalizeNutritionSurvey } from './nutritionPlanBuilder.js'

export function defaultNutritionSurvey() {
  return {
    age: 30,
    activityLevel: 'moderate',
    goalKind: 'maintain',
    mealsPerDay: 4,
    exclusions: [],
    pickedProducts: { protein: [], fat: [], carbs: [] },
  }
}

/** Опросник из БД: null, если не сохраняли (без подстановки дефолтов на экране). */
export function nutritionSurveyFromStorage(raw) {
  if (raw == null) return null
  const normalized = normalizeNutritionSurvey(raw)
  const defined = Object.fromEntries(Object.entries(normalized).filter(([, v]) => v !== undefined))
  return { ...defaultNutritionSurvey(), ...defined }
}
