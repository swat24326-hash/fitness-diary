/**
 * Строка журнала для неуспешных ответов API на ВМ (journalctl). Без токенов, тел и query —
 * только метод, путь, код, время и id пользователя из JWT (подпись не проверяем: это лог, не доступ).
 */

const LOGGED_PREFIXES = ['/api/', '/auth/v1/', '/rest/v1/']
const UUID_RE = /^[0-9a-f-]{36}$/i

/** @param {string} pathname @param {number} status */
export function shouldLogPortableResponse(pathname, status) {
  const code = Number(status) || 0
  if (code < 400) return false
  return LOGGED_PREFIXES.some((p) => String(pathname ?? '').startsWith(p))
}

/** @param {unknown} authorization */
export function userIdFromBearerForLog(authorization) {
  const header = String(authorization ?? '')
  if (!header.startsWith('Bearer ')) return null
  const parts = header.slice(7).trim().split('.')
  if (parts.length !== 3) return null
  try {
    const sub = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))?.sub
    return typeof sub === 'string' && UUID_RE.test(sub) ? sub : null
  } catch {
    return null
  }
}

/**
 * @param {{ method?: string, pathname: string, status: number, ms: number, userId?: string | null }} row
 */
export function formatPortableResponseLog(row) {
  const user = row.userId ? ` user=${row.userId}` : ''
  return `[api] ${row.method || 'GET'} ${row.pathname} ${row.status} ${Math.round(row.ms)}ms${user}`
}
