/**
 * Сохранённый рацион → снимок для приложения клиента («Питание»).
 * Черновик и устаревший рацион (сменился вес/рост) не отправляем — клиент получил бы не то, что тренер видит как актуальное.
 * Референты, опросник и вес клиента в снимок не идут.
 */
import { sanitizeClientPlanPayload } from '../clientPlans/clientPlanCore.js'
import { isNutritionPlanStale } from './nutritionPlanStaleCore.js'

/**
 * @param {object|null} plan сохранённый рацион (nutrition_plan)
 * @param {{ health?: object|null, planUnsaved?: boolean, goalKindLabel?: string }} ctx
 * @returns {{ ok: true, payload: object } | { ok: false, error: 'unsaved'|'stale'|'empty_plan' }}
 */
export function buildNutritionAppSnapshot(plan, { health = null, planUnsaved = false, goalKindLabel = '' } = {}) {
  if (planUnsaved) return { ok: false, error: 'unsaved' }
  if (!plan) return { ok: false, error: 'empty_plan' }
  if (isNutritionPlanStale(health, plan)) return { ok: false, error: 'stale' }
  const mapMeal = (meal) => {
    const steps = Array.isArray(meal?.recipeSteps)
      ? meal.recipeSteps.map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, 6)
      : []
    const row = {
      label: meal?.dishLabel ? `${meal.label} · ${meal.dishLabel}` : meal?.label,
      subtotal: meal?.subtotal,
      items: (meal?.items ?? []).map((it) => ({
        label: it?.label,
        portion: it?.portionLabel,
        grams: it?.grams,
        kcal: it?.kcal,
        proteinG: it?.proteinG,
        fatG: it?.fatG,
        carbsG: it?.carbsG,
      })),
    }
    if (steps.length) row.steps = steps
    return row
  }

  const body = {
    goal: goalKindLabel,
    kcal_target: plan.kcalTarget,
    totals: plan.totals,
    disclaimer: plan.disclaimer,
    meals: (plan.dayPlan ?? []).map(mapMeal),
  }
  if (Array.isArray(plan.days) && plan.days.length > 1) {
    body.days = plan.days.map((d) => ({
      label: d.label,
      totals: d.totals,
      meals: (d.dayPlan ?? []).map(mapMeal),
    }))
  }
  const payload = sanitizeClientPlanPayload('nutrition', body)
  return payload ? { ok: true, payload } : { ok: false, error: 'empty_plan' }
}

export const NUTRITION_APP_SEND_ERRORS_RU = Object.freeze({
  unsaved: 'Сначала сохраните рацион',
  stale: 'Рацион устарел — сначала пересоберите',
  empty_plan: 'В рационе нет приёмов пищи',
})
