/**
 * Keep-alive списка клиентов: отличить путь карточки от списка (без React).
 */

/**
 * @param {'admin' | 'sales_manager'} [accessMode]
 * @returns {string}
 */
export function adminClientsListBasePath(accessMode = 'admin') {
  return accessMode === 'sales_manager' ? '/sales/clients' : '/admin/clients'
}

/**
 * `/admin/clients/:id` или `/sales/clients/:id` — карточка; иначе список (или чужой путь).
 * @param {string} pathname
 * @param {string} listBasePath
 */
export function isAdminClientsCardPathname(pathname, listBasePath) {
  const base = String(listBasePath ?? '')
    .trim()
    .replace(/\/+$/, '')
  const path = String(pathname ?? '')
    .split('?')[0]
    .trim()
    .replace(/\/+$/, '')
  if (!base || !path) return false
  if (path === base) return false
  const prefix = `${base}/`
  if (!path.startsWith(prefix)) return false
  const rest = path.slice(prefix.length)
  if (!rest || rest.includes('/')) return false
  return true
}
