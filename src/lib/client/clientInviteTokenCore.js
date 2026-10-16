/**
 * Токен входа клиента из QR / ссылки (без React).
 * QR клуба — buildClientJoinUrl → /me/join#t=…; значок iPhone — /me/?h=… (тот же redeem).
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/

export function isClientInviteTokenShape(raw) {
  return TOKEN_RE.test(String(raw ?? '').trim())
}

/** Достать токен из текста QR или вставленной ссылки. */
export function clientInviteTokenFromScan(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  if (isClientInviteTokenShape(s) && !/[/?#]/.test(s)) return s
  try {
    const u = new URL(s, 'https://local.invalid')
    const fromHash = new URLSearchParams(u.hash.replace(/^#/, '')).get('t')
    if (isClientInviteTokenShape(fromHash)) return fromHash.trim()
    const h = u.searchParams.get('h')
    if (isClientInviteTokenShape(h)) return h.trim()
    const pathT = u.searchParams.get('t')
    if (isClientInviteTokenShape(pathT)) return pathT.trim()
  } catch {
    /* не URL */
  }
  const hashMatch = s.match(/#t=([A-Za-z0-9_-]{8,64})/)
  if (hashMatch) return hashMatch[1]
  const hMatch = s.match(/[?&]h=([A-Za-z0-9_-]{8,64})/)
  if (hMatch) return hMatch[1]
  return ''
}
