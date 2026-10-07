/**
 * Вход в приложение со значка на iPhone. У значка своё хранилище, сессия из Safari туда не переходит,
 * поэтому Safari заранее берёт одноразовое приглашение и кладёт его в start_url значка (/me?h=…).
 * Приглашение то же, что из клуба (client_invites), но created_by = null и живёт сутки.
 */
export const CLIENT_HANDOFF_TTL_MS = 24 * 60 * 60 * 1000

export function isClientHandoffToken(raw) {
  return /^[A-Za-z0-9_-]{20,64}$/.test(String(raw ?? ''))
}

/** @returns {string} start_url значка: с приглашением или обычный /me. */
export function clientHandoffStartUrl(token) {
  return isClientHandoffToken(token) ? `/me?h=${token}` : '/me'
}
