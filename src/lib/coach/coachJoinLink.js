/** Ссылка из QR планшета: /coach/join#t=… — код в #фрагменте не попадает в логи сервера и Referer. */
export const COACH_JOIN_PATH = '/coach/join'

export function buildCoachJoinUrl(origin, token) {
  return `${String(origin).replace(/\/$/, '')}${COACH_JOIN_PATH}#t=${encodeURIComponent(token)}`
}

/** Код из #t=…; мусор и слишком длинное — пусто (сервер всё равно проверит). */
export function coachQrTokenFromHash(hash) {
  const raw = new URLSearchParams(String(hash ?? '').replace(/^#/, '')).get('t') ?? ''
  const token = raw.trim()
  return /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : ''
}
