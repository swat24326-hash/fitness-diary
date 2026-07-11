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
 * @param {object} plan
 * @param {string} generatedAt
 */
export function nutritionPlanHistoryEntry(plan, generatedAt) {
  return {
    generated_at: generatedAt,
    kcal: plan?.totals?.kcal ?? null,
    kcalTarget: plan?.kcalTarget ?? null,
    proteinG: plan?.totals?.proteinG ?? null,
    fatG: plan?.totals?.fatG ?? null,
    carbsG: plan?.totals?.carbsG ?? null,
    mealsPerDay: plan?.mealsPerDay ?? null,
  }
}

/**
 * @param {unknown} raw
 */
export function parseNutritionPlanHistory(raw) {
  const parsed = parseJsonArrayField(raw)
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (x) =>
        x &&
        typeof x === 'object' &&
        x.generated_at &&
        (x.kcal != null ||
          x.kcalTarget != null ||
          x.proteinG != null ||
          x.plan?.totals?.kcal != null ||
          x.plan?.kcalTarget != null),
    )
    .map((x) => ({
      generated_at: String(x.generated_at),
      kcal: x.kcal ?? x.plan?.totals?.kcal ?? null,
      kcalTarget: x.kcalTarget ?? x.plan?.kcalTarget ?? null,
      proteinG: x.proteinG ?? x.plan?.totals?.proteinG ?? null,
      fatG: x.fatG ?? x.plan?.totals?.fatG ?? null,
      carbsG: x.carbsG ?? x.plan?.totals?.carbsG ?? null,
      mealsPerDay: x.mealsPerDay ?? x.plan?.mealsPerDay ?? null,
    }))
}

/**
 * Добавить снимок ккал/БЖУ в историю перед заменой новым рационом.
 * @param {unknown} prevHistory
 * @param {{ plan: object, generatedAt: string }} snapshot
 */
export function appendNutritionPlanHistory(prevHistory, snapshot) {
  if (!snapshot?.plan || !snapshot.generatedAt) return parseNutritionPlanHistory(prevHistory)
  const history = parseNutritionPlanHistory(prevHistory)
  const entry = nutritionPlanHistoryEntry(snapshot.plan, snapshot.generatedAt)
  const next = [entry, ...history.filter((h) => h.generated_at !== snapshot.generatedAt)].slice(
    0,
    NUTRITION_PLAN_HISTORY_MAX,
  )
  return next
}
