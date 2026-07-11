export const NUTRITION_PLAN_HISTORY_MAX = 20

function parseJsonArrayField(raw) {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : null
    } catch {
      return null
    }
  }
  return null
}

/**
 * @param {unknown} raw
 */
export function parseNutritionPlanHistory(raw) {
  const parsed = parseJsonArrayField(raw)
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((x) => x && typeof x === 'object' && x.plan && x.generated_at)
    .map((x) => ({
      generated_at: String(x.generated_at),
      plan: x.plan,
      kcalTarget: x.kcalTarget ?? x.plan?.kcalTarget ?? null,
      mealsPerDay: x.mealsPerDay ?? x.plan?.mealsPerDay ?? null,
    }))
}

/**
 * Добавить текущий план в историю перед заменой новым.
 * @param {unknown} prevHistory
 * @param {{ plan: object, generatedAt: string }} snapshot
 */
export function appendNutritionPlanHistory(prevHistory, snapshot) {
  if (!snapshot?.plan || !snapshot.generatedAt) return parseNutritionPlanHistory(prevHistory)
  const history = parseNutritionPlanHistory(prevHistory)
  const entry = {
    generated_at: snapshot.generatedAt,
    plan: snapshot.plan,
    kcalTarget: snapshot.plan.kcalTarget ?? null,
    mealsPerDay: snapshot.plan.mealsPerDay ?? null,
  }
  const next = [entry, ...history.filter((h) => h.generated_at !== snapshot.generatedAt)].slice(
    0,
    NUTRITION_PLAN_HISTORY_MAX,
  )
  return next
}
