/**
 * Лимит неудачных входов по паролю. На Supabase есть встроенный, на своём сервере — только этот.
 * Ключ «логин + IP»: планшеты зала за одним NAT не блокируют друг друга, а чужой IP не
 * закрывает вход тренеру. Потолок на IP — против перебора по многим логинам.
 * Память процесса: на одном сервере C2 честно; на Vercel — в пределах экземпляра.
 */

export const AUTH_FAIL_LIMIT_PER_LOGIN = 10
export const AUTH_FAIL_LIMIT_PER_IP = 100
export const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000
const PRUNE_ABOVE = 5000

/** @param {Record<string, unknown>} headers */
export function clientIpFromHeaders(headers) {
  const h = headers ?? {}
  const fwd = String(h['x-forwarded-for'] ?? '').split(',')[0].trim()
  if (fwd) return fwd
  const real = String(h['x-real-ip'] ?? '').trim()
  return real || 'unknown'
}

/** @param {number} retryAfterSec */
export function authRateLimitedMessageRu(retryAfterSec) {
  const min = Math.max(1, Math.ceil(retryAfterSec / 60))
  return `Слишком много неудачных попыток входа. Подождите ${min} мин. или обратитесь к администратору.`
}

/**
 * @param {{ now?: () => number, perLogin?: number, perIp?: number, windowMs?: number }} [opts]
 */
export function createAuthFailLimiter(opts = {}) {
  const now = opts.now ?? Date.now
  const perLogin = opts.perLogin ?? AUTH_FAIL_LIMIT_PER_LOGIN
  const perIp = opts.perIp ?? AUTH_FAIL_LIMIT_PER_IP
  const windowMs = opts.windowMs ?? AUTH_FAIL_WINDOW_MS
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map()

  const loginKey = (login, ip) => `l:${String(login ?? '').trim().toLowerCase()}|${ip}`
  const ipKey = (ip) => `ip:${ip}`

  function live(key) {
    const b = buckets.get(key)
    if (!b) return null
    if (b.resetAt <= now()) {
      buckets.delete(key)
      return null
    }
    return b
  }

  function bump(key) {
    const b = live(key)
    if (b) b.count++
    else buckets.set(key, { count: 1, resetAt: now() + windowMs })
  }

  function prune() {
    if (buckets.size <= PRUNE_ABOVE) return
    for (const key of [...buckets.keys()]) live(key)
  }

  return {
    /** @returns {{ ok: true } | { ok: false, retryAfterSec: number }} */
    check(login, ip) {
      for (const [key, limit] of [
        [loginKey(login, ip), perLogin],
        [ipKey(ip), perIp],
      ]) {
        const b = live(key)
        if (b && b.count >= limit) return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now()) / 1000) }
      }
      return { ok: true }
    },
    /** 401 — неверные данные; 200 — успех сбрасывает логин; прочее (403 блок, 5xx) не считается. */
    recordOutcome(login, ip, status) {
      if (status === 200) {
        buckets.delete(loginKey(login, ip))
        return
      }
      if (status !== 401) return
      prune()
      bump(loginKey(login, ip))
      bump(ipKey(ip))
    },
  }
}

export const authFailLimiter = createAuthFailLimiter()
