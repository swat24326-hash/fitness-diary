/**
 * «Есть приложение» для клиента /me: не любой разовый вход по QR, а живая сессия с признаком использования.
 * Иначе пробный вход оставляет сессию навсегда → ложные «ещё не открыл рацион» и яркий конвертик.
 */

/** Час после создания сессии без refresh ещё считаем «только что вошёл». */
export const CLIENT_APP_SESSION_GRACE_MS = 60 * 60 * 1000

/**
 * @param {{ revoked_at?: string|null, created_at?: string|null, last_refresh_at?: string|null }|null|undefined} session
 * @param {number} [nowMs]
 */
export function clientSessionLooksActive(session, nowMs = Date.now()) {
  if (!session || session.revoked_at) return false
  if (session.last_refresh_at) return true
  const created = Date.parse(String(session.created_at ?? ''))
  if (!Number.isFinite(created)) return false
  return nowMs - created < CLIENT_APP_SESSION_GRACE_MS
}

/** Есть ли хотя бы одна «живая» сессия с использованием. */
export function clientHasActiveAppSession(sessions, nowMs = Date.now()) {
  return (sessions ?? []).some((s) => clientSessionLooksActive(s, nowMs))
}
