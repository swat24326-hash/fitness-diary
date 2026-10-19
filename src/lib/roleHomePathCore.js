/**
 * Домашний путь роли после входа (сотрудник: админ / продажи / супервизор / тренер планшет).
 * Телефонные приложения `/coach` и `/me` сюда не ходят.
 */
export function roleHomePath(role) {
  if (role === 'admin') return '/admin'
  if (role === 'sales_manager') return '/sales'
  if (role === 'supervisor') return '/club'
  return '/trainer'
}
