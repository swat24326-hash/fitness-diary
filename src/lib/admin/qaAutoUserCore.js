/** Префикс логинов автотестов (scripts/setup-qa-users.mjs). */
export const QA_AUTO_LOGIN_PREFIX = 'qa_auto_'

/**
 * Тестовый пользователь для e2e — не показывать в UI клуба.
 * @param {{ login?: string, email?: string } | null | undefined} user
 */
export function isQaAutoUser(user) {
  const login = String(user?.login ?? '').trim().toLowerCase()
  if (login.startsWith(QA_AUTO_LOGIN_PREFIX)) return true
  const email = String(user?.email ?? '').trim().toLowerCase()
  return email.endsWith('@qa.local')
}
