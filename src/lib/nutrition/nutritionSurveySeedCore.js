/**
 * Подстановка возраста и цели питания из карты клиента / «Здоровье»,
 * чтобы опросник рациона не дублировал уже известные поля.
 *
 * Возраст для рациона — любой полный год 0…120 (дети и подростки тоже).
 * Не используем clamp пульса (5…100): иначе ДР ребёнка даёт «нет возраста».
 */
import { parseHealthGoal } from '../health/healthGoalCore.js'

/** Цель в анкете здоровья → цель питания (КБЖУ). */
export const HEALTH_GOAL_TO_NUTRITION = {
  fat_loss: 'lose_weight',
  muscle: 'gain_mass',
  recomp: 'maintain',
  tone: 'maintain',
  endurance: 'endurance',
  back: 'maintain',
  mobility: 'maintain',
  general: 'maintain',
  rehab: 'maintain',
}

/**
 * @param {{ birth_date?: string|null }|null|undefined} client
 * @param {string} [asOfIso]
 * @returns {number|null}
 */
export function nutritionAgeFromClient(client, asOfIso) {
  const b = String(client?.birth_date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return null
  const asOf = String(asOfIso ?? '').slice(0, 10)
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? asOf : null
  const today = ref ? new Date(`${ref}T12:00:00`) : new Date()
  const [y, m, d] = b.split('-').map(Number)
  const birth = new Date(y, m - 1, d)
  if (Number.isNaN(birth.getTime())) return null
  let age = today.getFullYear() - birth.getFullYear()
  const md = today.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && today.getDate() < birth.getDate())) age -= 1
  if (age < 0 || age > 120) return null
  return age
}

/**
 * @param {{ goal?: string|null }|null|undefined} health
 * @returns {import('./nutritionMacrosCore.js').NutritionGoalKind}
 */
export function nutritionGoalKindFromHealth(health) {
  const { id } = parseHealthGoal(health?.goal)
  if (id && HEALTH_GOAL_TO_NUTRITION[id]) return HEALTH_GOAL_TO_NUTRITION[id]
  const t = String(health?.goal ?? '').toLowerCase()
  if (/сниж|похуд|минус\s*\d|дефицит/.test(t)) return 'lose_weight'
  if (/набор|масс|мышц|гипертроф/.test(t)) return 'gain_mass'
  if (/выносл|кардио|бег/.test(t)) return 'endurance'
  return 'maintain'
}

/**
 * Свести опросник с картой: возраст из ДР; цель — из здоровья при `forceGoal` или пустой цели.
 *
 * @param {object|null|undefined} survey
 * @param {{ client?: object, health?: object, asOfIso?: string, forceGoal?: boolean }} [ctx]
 */
export function seedNutritionSurveyFromClientHealth(survey, ctx = {}) {
  const next = { ...(survey && typeof survey === 'object' ? survey : {}) }
  const age = nutritionAgeFromClient(ctx.client, ctx.asOfIso)
  if (age != null) next.age = age
  if (ctx.forceGoal === true || !next.goalKind) {
    next.goalKind = nutritionGoalKindFromHealth(ctx.health)
  }
  return next
}
