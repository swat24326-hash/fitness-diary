/**
 * Пути экрана «Списки» для админа / менеджера / управляющего.
 */

/**
 * @param {'admin' | 'sales_manager' | 'supervisor'} [accessMode]
 */
export function adminClientListsPath(accessMode = 'admin') {
  if (accessMode === 'sales_manager') return '/sales/client-lists'
  if (accessMode === 'supervisor') return '/club/client-lists'
  return '/admin/client-lists'
}

/**
 * @param {'admin' | 'sales_manager' | 'supervisor'} [accessMode]
 */
export function adminClientsListPathForLists(accessMode = 'admin') {
  if (accessMode === 'sales_manager') return '/sales/clients'
  if (accessMode === 'supervisor') return '/club/clients'
  return '/admin/clients'
}
