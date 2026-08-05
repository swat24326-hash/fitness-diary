/**
 * Query param role для GET /api/list-trainers (админские вкладки Структура).
 * Без param → только тренеры; sales_manager / supervisor — отдельные списки.
 */

/**
 * @param {unknown} role
 * @returns {'sales_manager' | 'supervisor' | null}
 */
export function resolveListTrainersRoleParam(role) {
  const r = String(role ?? '').trim().toLowerCase()
  if (r === 'sales_manager') return 'sales_manager'
  if (r === 'supervisor') return 'supervisor'
  return null
}
