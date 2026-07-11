/** @typedef {'lose_weight' | 'maintain' | 'gain_mass' | 'endurance'} NutritionGoalKind */

/** @typedef {'sedentary' | 'light' | 'moderate' | 'high' | 'very_high'} NutritionActivityLevel */

/** @typedef {'female' | 'male'} NutritionSex */

export const NUTRITION_GOAL_OPTIONS = [
  { id: 'lose_weight', label: 'Снижение веса' },
  { id: 'maintain', label: 'Поддержание' },
  { id: 'gain_mass', label: 'Набор массы' },
  { id: 'endurance', label: 'Выносливость' },
]

export const NUTRITION_ACTIVITY_OPTIONS = [
  { id: 'sedentary', label: 'Сидячая', factor: 1.2 },
  { id: 'light', label: 'Лёгкая (1–2 трен./нед)', factor: 1.375 },
  { id: 'moderate', label: 'Средняя (3–4 трен./нед)', factor: 1.55 },
  { id: 'high', label: 'Высокая (5–6 трен./нед)', factor: 1.725 },
  { id: 'very_high', label: 'Очень высокая', factor: 1.9 },
]

export const NUTRITION_MEALS_PER_DAY_OPTIONS = [3, 4, 5, 6]

export const NUTRITION_EXCLUSION_OPTIONS = [
  { id: 'lactose', label: 'Без лактозы' },
  { id: 'gluten', label: 'Без глютена' },
]

const GOAL_KCAL_FACTOR = {
  lose_weight: 0.85,
  maintain: 1,
  gain_mass: 1.1,
  endurance: 1,
}

export const GOAL_MACRO_PCT = {
  lose_weight: { protein: 0.3, fat: 0.25, carbs: 0.45 },
  maintain: { protein: 0.25, fat: 0.3, carbs: 0.45 },
  gain_mass: { protein: 0.25, fat: 0.25, carbs: 0.5 },
  endurance: { protein: 0.2, fat: 0.25, carbs: 0.55 },
}

/**
 * @param {{ sex?: NutritionSex, age?: number, weightKg?: number, heightCm?: number }} input
 */
export function computeBmr(input) {
  const weight = Number(input.weightKg)
  const height = Number(input.heightCm)
  const age = Number(input.age)
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null
  const ageVal = Number.isFinite(age) && age > 0 ? age : 30
  const base = 10 * weight + 6.25 * height - 5 * ageVal
  if (input.sex === 'male') return base + 5
  return base - 161
}

/**
 * @param {number} bmr
 * @param {NutritionActivityLevel} activityLevel
 */
export function computeTdee(bmr, activityLevel) {
  if (!Number.isFinite(bmr) || bmr <= 0) return null
  const opt = NUTRITION_ACTIVITY_OPTIONS.find((o) => o.id === activityLevel)
  const factor = opt?.factor ?? 1.55
  return Math.round(bmr * factor)
}

/**
 * @param {number} tdee
 * @param {NutritionGoalKind} goalKind
 */
export function computeKcalTarget(tdee, goalKind) {
  if (!Number.isFinite(tdee) || tdee <= 0) return null
  const f = GOAL_KCAL_FACTOR[goalKind] ?? 1
  return Math.round(tdee * f)
}

/**
 * @param {number} kcalTarget
 * @param {NutritionGoalKind} goalKind
 */
export function computeMacroTargets(kcalTarget, goalKind) {
  const pct = GOAL_MACRO_PCT[goalKind] ?? GOAL_MACRO_PCT.maintain
  const proteinG = Math.round((kcalTarget * pct.protein) / 4)
  const fatG = Math.round((kcalTarget * pct.fat) / 9)
  const carbsG = Math.round((kcalTarget * pct.carbs) / 4)
  return { proteinG, fatG, carbsG }
}

/**
 * @param {import('./nutritionProductCatalog.js').NutritionProduct} product
 * @param {number} grams
 */
export function macrosForGrams(product, grams) {
  const g = Number(grams)
  if (!product || !Number.isFinite(g) || g <= 0) {
    return { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }
  }
  const ratio = g / 100
  const proteinG = Math.round(product.proteinPer100 * ratio * 10) / 10
  const fatG = Math.round(product.fatPer100 * ratio * 10) / 10
  const carbsG = Math.round(product.carbsPer100 * ratio * 10) / 10
  const kcal = Math.round(proteinG * 4 + fatG * 9 + carbsG * 4)
  return { kcal, proteinG, fatG, carbsG }
}

export function roundGrams(grams) {
  const g = Number(grams)
  if (!Number.isFinite(g) || g <= 0) return 0
  return Math.max(5, Math.round(g / 5) * 5)
}

/**
 * @param {{ proteinPer100?: number, fatPer100?: number, carbsPer100?: number }} product
 */
export function kcalPer100(product) {
  if (!product) return 0
  const kcal = product.proteinPer100 * 4 + product.fatPer100 * 9 + product.carbsPer100 * 4
  return Math.round(kcal)
}

/**
 * Граммы продукта под целевые ккал из порции.
 * @param {{ proteinPer100?: number, fatPer100?: number, carbsPer100?: number }} product
 * @param {number} kcal
 */
export function gramsForKcal(product, kcal) {
  const k100 = kcalPer100(product)
  if (!k100 || k100 <= 0 || !Number.isFinite(kcal) || kcal <= 0) return 0
  return roundGrams((kcal / k100) * 100)
}

export function formatProductPortion(product, grams) {
  if (product?.pieceGrams && grams >= product.pieceGrams * 0.5) {
    const pieces = Math.max(1, Math.round(grams / product.pieceGrams))
    const approxG = pieces * product.pieceGrams
    return { display: `${pieces} шт`, grams: approxG, pieces }
  }
  return { display: `${grams} г`, grams, pieces: null }
}
