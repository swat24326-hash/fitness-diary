/**
 * Стык дневника с рационом тренера: факт ккал vs цель плана.
 * Чистый АЗ/ТЗ без рациона — целей из плана нет (остаются дефолты дневника).
 */
import { FOOD_DIARY_DEFAULT_TARGETS } from './foodDiarySummaryCore.js'

function round1(n) {
  return Math.round(Number(n) * 10) / 10
}

function positiveNum(v) {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Достать целевые ккал из снимка рациона (health.nutrition_plan или client_plans payload).
 * @param {object|null|undefined} plan
 */
export function nutritionPlanTargetKcal(plan) {
  if (!plan || typeof plan !== 'object') return null
  const direct = positiveNum(plan.target_kcal ?? plan.kcal_target ?? plan.daily_kcal ?? plan.kcalTarget)
  if (direct) return Math.round(direct)
  const totals = plan.totals ?? plan.day_totals ?? plan.summary
  const fromTotals = positiveNum(totals?.kcal)
  if (fromTotals) return Math.round(fromTotals)
  const days = plan.days
  if (Array.isArray(days) && days.length) {
    let sum = 0
    let n = 0
    for (const d of days) {
      const k = positiveNum(d?.totals?.kcal ?? d?.kcal)
      if (k) {
        sum += k
        n += 1
      }
    }
    if (n) return Math.round(sum / n)
  }
  return null
}

/**
 * Цели сводки дневника из payload рациона клиента (client_plans).
 * @param {object|null|undefined} planPayload
 * @returns {Partial<typeof FOOD_DIARY_DEFAULT_TARGETS> | null}
 */
export function targetsFromNutritionPlan(planPayload) {
  if (!planPayload || typeof planPayload !== 'object') return null
  const kcal = nutritionPlanTargetKcal(planPayload)
  if (!kcal) return null
  const totals = planPayload.totals ?? {}
  const protein = positiveNum(totals.protein_g ?? totals.proteinG ?? totals.protein)
  const fat = positiveNum(totals.fat_g ?? totals.fatG ?? totals.fat)
  const carbs = positiveNum(totals.carbs_g ?? totals.carbsG ?? totals.carbs)
  /** @type {Partial<typeof FOOD_DIARY_DEFAULT_TARGETS>} */
  const out = { kcal }
  if (protein) out.protein_g = round1(protein)
  if (fat) out.fat_g = round1(fat)
  if (carbs) out.carbs_g = round1(carbs)
  return out
}

/**
 * Цели дня: дефолты ← свои (АЗ/ТЗ) ← рацион тренера (ПЗ).
 * @param {{ plan?: object|null, personal?: object|null } | object | null} [opts]
 *   устаревший вызов: один объект плана или null.
 */
export function mergeFoodDiaryTargets(opts = null) {
  let plan = null
  let personal = null
  if (opts && typeof opts === 'object' && ('plan' in opts || 'personal' in opts)) {
    plan = opts.plan ?? null
    personal = opts.personal ?? null
  } else if (opts && typeof opts === 'object') {
    plan = opts
  }
  return {
    ...FOOD_DIARY_DEFAULT_TARGETS,
    ...(personal || {}),
    ...(plan || {}),
  }
}

/**
 * @param {{ kcal?: number }} dayTotals
 * @param {number|null} planKcal
 */
export function compareFoodDiaryToPlan(dayTotals, planKcal) {
  const fact = round1(Number(dayTotals?.kcal) || 0)
  const target = planKcal != null && Number(planKcal) > 0 ? Math.round(Number(planKcal)) : null
  if (target == null) {
    return {
      has_plan: false,
      fact_kcal: fact,
      plan_kcal: null,
      delta_kcal: null,
      status: 'no_plan',
      label_ru: 'Рациона от тренера пока нет',
    }
  }
  const delta = round1(fact - target)
  let status = 'ok'
  let label_ru = 'Около цели рациона'
  if (fact <= 0) {
    status = 'empty'
    label_ru = 'За день ещё ничего не записано'
  } else if (delta > target * 0.15) {
    status = 'over'
    label_ru = 'Выше цели рациона'
  } else if (delta < -target * 0.15) {
    status = 'under'
    label_ru = 'Ниже цели рациона'
  }
  return {
    has_plan: true,
    fact_kcal: fact,
    plan_kcal: target,
    delta_kcal: delta,
    status,
    label_ru,
  }
}
