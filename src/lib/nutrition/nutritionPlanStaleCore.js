/**
 * Устаревание рациона при смене роста/веса в «Здоровье».
 */
import { getHealthCurrentWeightKg } from '../clientWeightCore.js'

/**
 * @param {{ weight_kg?: number | null, current_weight_kg?: number | null, height_cm?: number | null } | null} health
 * @param {{ basis?: { weightKg?: number, heightCm?: number } } | null} plan
 */
export function isNutritionPlanStale(health, plan) {
  const basis = plan?.basis
  if (!basis) return false
  const w = getHealthCurrentWeightKg(health)
  const h = Number(health?.height_cm)
  if (w == null || !Number.isFinite(h) || h <= 0) return false
  return Math.round(w * 10) !== Math.round(Number(basis.weightKg) * 10) || Math.round(h) !== Math.round(Number(basis.heightCm))
}

export function nutritionPlanStaleMessage(health, plan) {
  if (!isNutritionPlanStale(health, plan)) return null
  const basis = plan?.basis
  const w = getHealthCurrentWeightKg(health)
  const prev = Number(basis?.weightKg)
  if (w != null && Number.isFinite(prev) && Math.round(w * 10) !== Math.round(prev * 10)) {
    return `Вес изменился (${prev} → ${w} кг). Пересоберите рацион.`
  }
  return 'Рост или вес в «Здоровье» изменились. Пересоберите рацион.'
}
