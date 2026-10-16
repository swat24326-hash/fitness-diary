import { normalizeNutritionSurvey } from './nutritionPlanBuilder.js'

export function defaultNutritionSurvey() {
  return {
    age: 30,
    activityLevel: 'moderate',
    goalKind: 'maintain',
    mealsPerDay: 4,
    exclusions: [],
    productSelectMode: /** @type {const} */ ('avoid'),
    avoidProductIds: [],
    pickedProducts: { protein: [], fat: [], carbs: [] },
    proteinAccent: /** @type {const} */ ('mixed'),
    daysCount: 1,
    nutritionAutoPush: false,
  }
}

/** Опросник из БД: null, если не сохраняли (без подстановки дефолтов на экране). */
export function nutritionSurveyFromStorage(raw) {
  if (raw == null) return null
  const normalized = normalizeNutritionSurvey(raw)
  const defined = Object.fromEntries(Object.entries(normalized).filter(([, v]) => v !== undefined))
  return { ...defaultNutritionSurvey(), ...defined }
}
