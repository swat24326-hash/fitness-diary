import { computeBmr, computeTdee } from './nutritionMacrosCore.js'

/** Граммы на кг веса. Белок и жир — норма, углеводы остаются от ккал. */
export const NUTRITION_PROTEIN_G_PER_KG = { min: 1.4, max: 2.2, aim: 1.6 }
export const NUTRITION_FAT_G_PER_KG = { min: 0.7, max: 1, aim: 0.8 }

function rateText(n) {
  const r = Math.round(Number(n) * 10) / 10
  if (!Number.isFinite(r)) return ''
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',')
}

function gramsPerKgLabel(band) {
  return `${rateText(band.min)}–${rateText(band.max)} г/кг`
}

/** Мелкая подпись под целью: как норма переводится в граммы и ккал. */
export function nutritionPerKgCaption(referents, key) {
  const weightKg = Number(referents?.weightKg)
  if (!referents || !weightKg) return null
  if (key === 'protein') return gramsPerKgLabel(NUTRITION_PROTEIN_G_PER_KG)
  if (key === 'fat') return gramsPerKgLabel(NUTRITION_FAT_G_PER_KG)
  if (key === 'carbs') return `${rateText(referents.carbs.min / weightKg)}–${rateText(referents.carbs.max / weightKg)} г/кг`
  if (key === 'kcal') return `${rateText(referents.kcal.aim / weightKg)} ккал/кг`
  return null
}

/** @typedef {{ min: number, max: number, aim: number }} ReferentBand */

/** @typedef {{ min: number, max: number, aim: number, tdee: number, bmr: number }} KcalReferents */

/**
 * Референтные диапазоны (ккал и БЖУ). Цель сборки — нижняя граница (aim ≈ min).
 * @param {{
 *   sex?: import('./nutritionMacrosCore.js').NutritionSex,
 *   age?: number,
 *   weightKg?: number,
 *   heightCm?: number,
 *   activityLevel?: import('./nutritionMacrosCore.js').NutritionActivityLevel,
 *   goalKind?: import('./nutritionMacrosCore.js').NutritionGoalKind,
 * }} input
 */
export function computeNutritionReferents(input) {
  const weightKg = Number(input.weightKg)
  const heightCm = Number(input.heightCm)
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null

  const bmr = computeBmr({ ...input, weightKg, heightCm })
  const tdee = computeTdee(bmr, input.activityLevel) ?? 0
  const goalKind = input.goalKind ?? 'maintain'

  /** @type {Record<string, { min: number, max: number, aim: number }>} */
  const kcalFactors = {
    lose_weight: { min: 0.75, max: 0.9, aim: 0.8 },
    maintain: { min: 0.95, max: 1.05, aim: 0.97 },
    gain_mass: { min: 1.05, max: 1.15, aim: 1.08 },
    endurance: { min: 0.95, max: 1.1, aim: 1.0 },
  }
  const kf = kcalFactors[goalKind] ?? kcalFactors.maintain

  /** @type {KcalReferents} */
  const kcal = {
    min: Math.round(tdee * kf.min),
    max: Math.round(tdee * kf.max),
    aim: Math.round(tdee * kf.aim),
    tdee,
    bmr: Math.round(bmr ?? 0),
  }

  /** @type {ReferentBand} */
  const protein = {
    min: Math.round(NUTRITION_PROTEIN_G_PER_KG.min * weightKg),
    max: Math.round(NUTRITION_PROTEIN_G_PER_KG.max * weightKg),
    aim: Math.round(NUTRITION_PROTEIN_G_PER_KG.aim * weightKg),
  }

  /** @type {ReferentBand} */
  const fat = {
    min: Math.round(NUTRITION_FAT_G_PER_KG.min * weightKg),
    max: Math.round(NUTRITION_FAT_G_PER_KG.max * weightKg),
    aim: Math.round(NUTRITION_FAT_G_PER_KG.aim * weightKg),
  }

  const carbsKcalAim = Math.max(0, kcal.aim - protein.aim * 4 - fat.aim * 9)
  const carbsKcalMin = Math.max(0, kcal.min - protein.max * 4 - fat.max * 9)
  const carbsKcalMax = Math.max(0, kcal.max - protein.min * 4 - fat.min * 9)

  /** @type {ReferentBand} */
  const carbs = {
    min: Math.round(carbsKcalMin / 4),
    max: Math.round(carbsKcalMax / 4),
    aim: Math.round(carbsKcalAim / 4),
  }

  return { kcal, protein, fat, carbs, goalKind, weightKg }
}

/**
 * @param {ReturnType<typeof computeNutritionReferents>} referents
 */
export function macroTargetsFromReferents(referents) {
  if (!referents) return { proteinG: 0, fatG: 0, carbsG: 0 }
  return {
    proteinG: referents.protein.aim,
    fatG: referents.fat.aim,
    carbsG: referents.carbs.aim,
  }
}

/**
 * Доли ккал по БЖУ для распределения по приёмам пищи.
 * @param {{ proteinG: number, fatG: number, carbsG: number }} macros
 */
export function macroKcalSharesFromTargets(macros) {
  const proteinKcal = macros.proteinG * 4
  const fatKcal = macros.fatG * 9
  const carbsKcal = macros.carbsG * 4
  const total = proteinKcal + fatKcal + carbsKcal
  if (!total) return { protein: 0.3, fat: 0.25, carbs: 0.45 }
  return {
    protein: proteinKcal / total,
    fat: fatKcal / total,
    carbs: carbsKcal / total,
  }
}

/** @param {number} value @param {ReferentBand} band */
export function isWithinReferentBand(value, band) {
  return value >= band.min && value <= band.max
}

/**
 * @param {{ kcal?: number, proteinG?: number, fatG?: number, carbsG?: number }} totals
 * @param {ReturnType<typeof computeNutritionReferents>} referents
 */
export function assessTotalsAgainstReferents(totals, referents) {
  if (!referents || !totals) return null
  return {
    kcal: isWithinReferentBand(totals.kcal ?? 0, referents.kcal),
    protein: isWithinReferentBand(totals.proteinG ?? 0, referents.protein),
    fat: isWithinReferentBand(totals.fatG ?? 0, referents.fat),
    carbs: isWithinReferentBand(totals.carbsG ?? 0, referents.carbs),
  }
}
