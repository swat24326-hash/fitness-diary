/**
 * Есть ли у строки плана целевые уровни / итог (чистая проверка без React).
 * @param {Record<string, unknown> | null | undefined} plan
 */
export function salesPlanRowHasTarget(plan) {
  if (!plan || typeof plan !== 'object') return false
  const l1 = Number(plan.plan_level_1) || 0
  const l2 = Number(plan.plan_level_2) || 0
  const l3 = Number(plan.plan_level_3) || 0
  if (l1 > 0 || l2 > 0 || l3 > 0) return true
  return (Number(plan.plan_total) || 0) > 0
}

/**
 * Форма плана с ненулевыми уровнями.
 * @param {Record<string, unknown> | null | undefined} form
 */
export function salesPlanFormHasTarget(form) {
  if (!form || typeof form !== 'object') return false
  return (
    (Number(form.plan_level_1) || 0) > 0 ||
    (Number(form.plan_level_2) || 0) > 0 ||
    (Number(form.plan_level_3) || 0) > 0
  )
}
