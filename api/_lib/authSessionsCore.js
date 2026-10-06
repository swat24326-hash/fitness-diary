/** Правила сессий своего входа: без базы и сети (verify-auth-own). */

/**
 * @param {{ id?: string, user_id?: string, revoked_at?: string | null } | null | undefined} row
 * @param {string} userId владелец из refresh-токена
 * @returns {'missing' | 'revoked' | null}
 */
export function ownSessionDenial(row, userId) {
  if (!row?.id || String(row.user_id ?? '') !== String(userId ?? '')) return 'missing'
  if (row.revoked_at) return 'revoked'
  return null
}

/** GoTrue: `global` — все устройства, иначе только эта сессия. */
export function ownLogoutScope(raw) {
  return String(raw ?? '').trim().toLowerCase() === 'global' ? 'global' : 'local'
}
