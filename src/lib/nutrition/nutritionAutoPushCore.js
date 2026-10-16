/**
 * Авто-выдача рациона в приложение клиента (фаза 7) — правила, как у ДЗ: prefs + событие.
 * Сама отправка — через client_plans; этот модуль решает «нужно ли» и собирает контекст.
 */
import { isNutritionPlanStale } from './nutritionPlanStaleCore.js'
import { getHealthCurrentWeightKg } from '../clientWeightCore.js'

/**
 * @param {object} p
 * @param {boolean} [p.enabled] — survey.nutritionAutoPush
 * @param {object|null} [p.health]
 * @param {object|null} [p.plan] — сохранённый nutrition_plan
 * @param {boolean} [p.planUnsaved]
 * @param {'weight_change'|'manual_recalc'|'schedule'} [p.trigger]
 * @returns {{ shouldPush: boolean, reason: string }}
 */
export function shouldAutoPushNutritionPlan(p) {
  if (!p?.enabled) return { shouldPush: false, reason: 'disabled' }
  if (p.planUnsaved) return { shouldPush: false, reason: 'unsaved' }
  if (!p.plan?.dayPlan?.length) return { shouldPush: false, reason: 'empty_plan' }
  if (isNutritionPlanStale(p.health, p.plan)) {
    // Устаревший без пересчёта не шлём — клиенту уйдёт мусор.
    if (p.trigger === 'weight_change') return { shouldPush: false, reason: 'stale_needs_recalc' }
    return { shouldPush: false, reason: 'stale' }
  }

  if (p.trigger === 'weight_change') {
    const w = getHealthCurrentWeightKg(p.health)
    const basis = p.plan.basis?.weightKg
    if (w != null && basis != null && Math.abs(Number(w) - Number(basis)) < 0.05) {
      return { shouldPush: false, reason: 'weight_unchanged' }
    }
    // После rescale basis уже новый — trigger weight_change + свежий план → пушим.
    return { shouldPush: true, reason: 'weight_recalculated' }
  }

  if (p.trigger === 'manual_recalc' || p.trigger === 'schedule') {
    return { shouldPush: true, reason: p.trigger }
  }

  return { shouldPush: false, reason: 'no_trigger' }
}

export const NUTRITION_AUTO_PUSH_REASONS_RU = Object.freeze({
  disabled: 'Авто-выдача выключена',
  unsaved: 'Сначала сохраните рацион',
  empty_plan: 'Нет рациона',
  stale: 'Рацион устарел',
  stale_needs_recalc: 'Сначала пересчитайте рацион под новый вес',
  weight_unchanged: 'Вес не изменился',
  weight_recalculated: 'Вес обновлён — отправляем рацион',
  manual_recalc: 'После пересчёта',
  schedule: 'По расписанию',
  no_trigger: 'Нет события для отправки',
})
