/**
 * Баннер «вес изменился» на карте здоровья и во вкладке питания.
 * Автоотправка включена и порог 3 кг пройден — не просим пересчитать вручную:
 * в воскресенье приложение само пересчитает КБЖУ и отправит рацион.
 */
import { getHealthCurrentWeightKg } from '../clientWeightCore.js'
import {
  NUTRITION_AUTO_WEIGHT_KG,
  addDaysIso,
  formatNutritionAutoDay,
  nutritionAutoHoldReason,
  nutritionAutoPrefsFromSurvey,
  nutritionAutoUpcomingSunday,
} from './nutritionAutoScheduleCore.js'
import { nutritionPlanStaleMessage } from './nutritionPlanStaleCore.js'

function surveyOf(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return typeof raw === 'object' ? raw : null
}

function weightShift(health, plan) {
  const next = getHealthCurrentWeightKg(health)
  const prev = Number(plan?.basis?.weightKg)
  if (next == null || !Number.isFinite(prev) || Math.round(next * 10) === Math.round(prev * 10)) return null
  return { prev, next }
}

/**
 * @param {object|null} health
 * @param {object|null} plan
 * @param {object|string|null} survey
 * @param {{ lastManualDay?: string|null, client?: object|null, now?: Date }} [ctx]
 * @returns {{ text: string, mode: 'auto'|'ask' }|null}
 */
export function nutritionStaleNotice(health, plan, survey, ctx = {}) {
  const ask = nutritionPlanStaleMessage(health, plan)
  if (!ask) return null
  const prefs = nutritionAutoPrefsFromSurvey(surveyOf(survey))
  if (!prefs.enabled) return { text: ask, mode: 'ask' }

  const sunday = nutritionAutoUpcomingSunday(ctx.now)
  const reason = nutritionAutoHoldReason({
    enabled: true,
    skipDate: prefs.skipDate,
    client: ctx.client ?? { archived_at: null },
    health,
    plan,
    sundayIso: sunday,
    lastManualDay: ctx.lastManualDay ?? null,
  })
  const shift = weightShift(health, plan)
  const weight = shift ? `Вес изменился (${shift.prev} → ${shift.next} кг). ` : 'Рост или вес изменились. '
  const day = formatNutritionAutoDay(sunday)

  if (!reason) {
    return {
      text: `${weight}КБЖУ пересчитаем и отправим рацион в воскресенье ${day}.`,
      mode: 'auto',
    }
  }
  if (reason === 'weight_ok') {
    return {
      text: `${weight}Сдвиг меньше ${NUTRITION_AUTO_WEIGHT_KG} кг — само не отправим. Пересчитайте КБЖУ сейчас.`,
      mode: 'ask',
    }
  }
  if (reason === 'manual' || reason === 'skip') {
    const next = formatNutritionAutoDay(addDaysIso(sunday, 7))
    const why =
      reason === 'manual'
        ? `В воскресенье ${day} само не уйдёт: рацион уже отправляли на этой неделе.`
        : `Воскресенье ${day} пропущено.`
    return {
      text: `${weight}${why} В следующее, ${next}, пересчитаем и отправим.`,
      mode: 'auto',
    }
  }
  return { text: ask, mode: 'ask' }
}
