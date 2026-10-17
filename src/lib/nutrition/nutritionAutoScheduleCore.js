/**
 * Авто-питание по воскресеньям: пересчёт КБЖУ при смене веса ≥ 3 кг и отправка в client_plans.
 * Окно и пауза «ручная отправка» — те же, что у авто-ДЗ (один cron на ВМ).
 */
import { stableUuid, isUuid } from '../stableUuid.js'
import { getHealthCurrentWeightKg } from '../clientWeightCore.js'
import { NUTRITION_GOAL_OPTIONS } from './nutritionMacrosCore.js'
import { normalizeNutritionSurvey } from './nutritionPlanBuilder.js'
import { rescaleNutritionPlanToHealth } from './nutritionPlanRescaleCore.js'
import { buildNutritionAppSnapshot } from './nutritionAppSendCore.js'
import { isNutritionPlanStale } from './nutritionPlanStaleCore.js'
import {
  HOMEWORK_AUTO_MANUAL_DAYS,
  HOMEWORK_AUTO_SEND_FROM_MIN,
  HOMEWORK_AUTO_SEND_TO_MIN,
  addDaysIso,
  formatHomeworkAutoDay,
  homeworkAutoUpcomingSunday,
  isSundayIso,
  nextHomeworkAutoSunday,
} from '../homework/auto/homeworkAutoScheduleCore.js'

/** Порог смены веса (кг) для воскресного пересчёта — решение владельца, HOMEWORK_AUTO.md. */
export const NUTRITION_AUTO_WEIGHT_KG = 3

export const NUTRITION_AUTO_SEND_FROM_MIN = HOMEWORK_AUTO_SEND_FROM_MIN
export const NUTRITION_AUTO_SEND_TO_MIN = HOMEWORK_AUTO_SEND_TO_MIN
export const NUTRITION_AUTO_MANUAL_DAYS = HOMEWORK_AUTO_MANUAL_DAYS

export { addDaysIso, isSundayIso, nextHomeworkAutoSunday, homeworkAutoUpcomingSunday as nutritionAutoUpcomingSunday }

export const formatNutritionAutoDay = formatHomeworkAutoDay

export const nutritionAutoPlanId = (clientId, sundayIso) =>
  stableUuid(`nutrition_auto_plan:${clientId}:${sundayIso}`)

/** Deep link в карточку → вкладка питания. */
export function nutritionAutoTrainerCardPath(clientId) {
  const id = String(clientId ?? '').trim()
  return id ? `/trainer/clients/${id}?tab=nutrition` : '/trainer/clients'
}

/**
 * Push тренеру после воскресной авто-отправки: «рацион ушёл из‑за веса».
 * @param {{ clientName?: string, deltaKg?: number|null, url?: string }} p
 */
export function buildNutritionAutoTrainerPush(p = {}) {
  const name = String(p.clientName ?? '').trim() || 'Клиент'
  const delta = p.deltaKg != null && Number.isFinite(Number(p.deltaKg)) ? Number(p.deltaKg) : null
  const deltaRu = delta != null ? String(delta).replace('.', ',') : null
  return {
    title: 'Рацион ушёл из‑за веса',
    body: deltaRu ? `${name} · вес изменился на ${deltaRu} кг` : `${name} · пересчитали и отправили в приложение`,
    url: String(p.url ?? '/trainer/clients'),
    tag: 'nutrition-auto-trainer',
  }
}

/**
 * Разница |текущий вес − basis плана|, кг. null — нет цифр.
 * @param {object|null} health
 * @param {object|null} plan
 */
export function nutritionAutoWeightDeltaKg(health, plan) {
  const now = getHealthCurrentWeightKg(health)
  const basis = plan?.basis?.weightKg != null ? Number(plan.basis.weightKg) : null
  if (now == null || basis == null || !Number.isFinite(basis)) return null
  return Math.round(Math.abs(now - basis) * 10) / 10
}

/** Вес ушёл на порог или рост/вес сделали план устаревшим при достаточном Δ веса. */
export function nutritionAutoNeedsRescale(health, plan) {
  if (!plan?.dayPlan?.length && !(Array.isArray(plan?.days) && plan.days.length)) return false
  const delta = nutritionAutoWeightDeltaKg(health, plan)
  if (delta != null && delta >= NUTRITION_AUTO_WEIGHT_KG) return true
  // Рост сменился при том же весе — тоже пересчёт (редкий случай).
  if (delta != null && delta < NUTRITION_AUTO_WEIGHT_KG) return false
  return isNutritionPlanStale(health, plan)
}

/**
 * @param {object|null} survey
 * @returns {{ enabled: boolean, skipDate: string|null }}
 */
export function nutritionAutoPrefsFromSurvey(survey) {
  const s = normalizeNutritionSurvey(survey)
  const skip = s.nutritionAutoSkipDate && isSundayIso(s.nutritionAutoSkipDate) ? s.nutritionAutoSkipDate : null
  return { enabled: s.nutritionAutoPush === true, skipDate: skip }
}

/**
 * Почему в это воскресенье рацион не уйдёт (null — уйдёт после пересчёта).
 * @param {{ enabled: boolean, skipDate?: string|null, client?: object|null, health?: object|null, plan?: object|null, sundayIso: string, lastManualDay?: string|null }} p
 */
export function nutritionAutoHoldReason(p) {
  if (!p?.enabled) return 'off'
  if (!p.client || p.client.archived_at) return 'archived'
  if (!p.plan?.dayPlan?.length && !(Array.isArray(p.plan?.days) && p.plan.days.length)) return 'no_plan'
  if (p.skipDate === p.sundayIso) return 'skip'
  if (p.lastManualDay && p.lastManualDay >= addDaysIso(p.sundayIso, -NUTRITION_AUTO_MANUAL_DAYS)) return 'manual'
  if (!nutritionAutoNeedsRescale(p.health, p.plan)) return 'weight_ok'
  return null
}

export const NUTRITION_AUTO_HOLD_RU = Object.freeze({
  off: 'Автоотправка выключена',
  archived: 'Клиент в архиве',
  no_plan: 'Сначала соберите и сохраните рацион',
  skip: 'Это воскресенье пропускаем',
  manual: 'Вы уже отправили рацион на этой неделе — автоматический не уйдёт',
  weight_ok: `Вес почти не изменился (нужно ≥ ${NUTRITION_AUTO_WEIGHT_KG} кг) — пересчёт не нужен`,
})

function goalLabel(survey) {
  const kind = normalizeNutritionSurvey(survey).goalKind
  return NUTRITION_GOAL_OPTIONS.find((o) => o.id === kind)?.label ?? ''
}

/**
 * Пересчёт + снимок client_plans на воскресенье.
 * @returns {{ ok: true, planRow: object, nextPlan: object, nextSurvey: object } | { ok: false, error: string }}
 */
export function buildNutritionAutoPlan({
  client,
  health,
  survey,
  plan,
  catalogMap,
  sundayIso,
  now = new Date(),
  sentBy,
}) {
  const prefs = nutritionAutoPrefsFromSurvey(survey)
  if (!prefs.enabled) return { ok: false, error: 'off' }
  const rescaled = rescaleNutritionPlanToHealth(plan, health, survey, catalogMap)
  if (!rescaled.ok) return { ok: false, error: rescaled.errors?.[0] || 'rescale_failed' }

  const healthAfter = {
    ...health,
    current_weight_kg: getHealthCurrentWeightKg(health),
    weight_kg: getHealthCurrentWeightKg(health),
    height_cm: health?.height_cm,
  }
  const snap = buildNutritionAppSnapshot(rescaled.plan, {
    health: healthAfter,
    planUnsaved: false,
    goalKindLabel: goalLabel(survey),
  })
  if (!snap.ok) return { ok: false, error: snap.error || 'empty_plan' }

  const trainerId = isUuid(client?.trainer_id) ? String(client.trainer_id) : null
  const by = isUuid(sentBy) ? String(sentBy) : trainerId
  if (!by) return { ok: false, error: 'no_sender' }

  const nextSurvey = {
    ...normalizeNutritionSurvey(survey),
    nutritionAutoPush: true,
    // После успешной воскресной отправки сброс skip не здесь — skip только на одно вс.
  }

  return {
    ok: true,
    nextPlan: rescaled.plan,
    nextSurvey,
    planRow: {
      id: nutritionAutoPlanId(String(client.id), sundayIso),
      client_id: String(client.id),
      club_id: isUuid(client?.club_id) ? String(client.club_id) : null,
      kind: 'nutrition',
      payload: snap.payload,
      sent_by: by,
      sent_at: now.toISOString(),
    },
  }
}
