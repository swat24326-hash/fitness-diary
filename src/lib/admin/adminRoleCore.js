/**
 * Чистая политика роли admin на API.
 * Email whitelist не даёт admin (только role / кириллический синоним).
 */
export function normalizeStaffRole(role) {
  return String(role ?? '').trim().toLowerCase()
}

const ADMIN_ROLES = new Set(['admin', 'администратор'])

/** Admin только по role. Второй аргумент (email) игнорируется — совместимость вызовов. */
export function isAdminByRole(role, _emailIgnored) {
  return ADMIN_ROLES.has(normalizeStaffRole(role))
}
