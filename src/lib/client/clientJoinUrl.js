/** Ссылка входа клиента в /me. Токен в #фрагменте: не попадает в логи сервера и в Referer. */
export function buildClientJoinUrl(origin, token) {
  return `${String(origin).replace(/\/$/, '')}/me/join#t=${encodeURIComponent(token)}`
}
