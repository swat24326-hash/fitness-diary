/**
 * Лимит неудачных входов по паролю. На Supabase есть встроенный, на своём сервере — только этот.
 * Три счётчика за окно: «логин + IP» (опечатки одного места), общий на логин (перебор с многих IP),
 * потолок на IP (перебор многих логинов). Общий лимит логина не закрывает IP, с которого по этому
 * логину уже входили успешно, — иначе любой извне держал бы зал без входа 10 запросами.
 * Память процесса: на одном сервере C2 честно; на Vercel — в пределах экземпляра.
 */

export const AUTH_FAIL_LIMIT_PER_LOGIN_IP = 10
export const AUTH_FAIL_LIMIT_PER_LOGIN = 30
export const AUTH_FAIL_LIMIT_PER_IP = 100
export const AUTH_FAIL_WINDOW_MS = 15 * 60 * 1000
export const AUTH_KNOWN_IP_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PRUNE_ABOVE = 5000

/** Прокси перед приложением — только Caddy на этой же машине. */
export function isTrustedProxyAddr(addr) {
  const a = String(addr ?? '').trim().replace(/^::ffff:/i, '')
  return a === '::1' || a.startsWith('127.')
}

/**
 * Левые значения X-Forwarded-For пишет клиент — им не верим. Правое добавил наш прокси.
 * @param {Record<string, unknown>} headers
 * @param {string} [remoteAddr] адрес сокета; не прокси → берём его, заголовки игнорируем
 */
export function clientIpFromHeaders(headers, remoteAddr) {
  const peer = String(remoteAddr ?? '').trim()
  if (peer && !isTrustedProxyAddr(peer)) return peer
  const h = headers ?? {}
  const hops = String(h['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (hops.length) return hops[hops.length - 1]
  const real = String(h['x-real-ip'] ?? '').trim()
  return real || peer || 'unknown'
}

/** @param {number} retryAfterSec */
export function authRateLimitedMessageRu(retryAfterSec) {
  const min = Math.max(1, Math.ceil(retryAfterSec / 60))
  return `Слишком много неудачных попыток входа. Подождите ${min} мин. или обратитесь к администратору.`
}

/**
 * @param {{ now?: () => number, perLoginIp?: number, perLogin?: number, perIp?: number, windowMs?: number, knownIpTtlMs?: number }} [opts]
 */
export function createAuthFailLimiter(opts = {}) {
  const now = opts.now ?? Date.now
  const perLoginIp = opts.perLoginIp ?? AUTH_FAIL_LIMIT_PER_LOGIN_IP
  const perLogin = opts.perLogin ?? AUTH_FAIL_LIMIT_PER_LOGIN
  const perIp = opts.perIp ?? AUTH_FAIL_LIMIT_PER_IP
  const windowMs = opts.windowMs ?? AUTH_FAIL_WINDOW_MS
  const knownIpTtlMs = opts.knownIpTtlMs ?? AUTH_KNOWN_IP_TTL_MS
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map()
  /** @type {Map<string, number>} «логин|IP» успешного входа → до какого времени доверяем */
  const knownIps = new Map()

  const norm = (login) => String(login ?? '').trim().toLowerCase()
  const loginIpKey = (login, ip) => `li:${norm(login)}|${ip}`
  const loginKey = (login) => `l:${norm(login)}`
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

  function isKnown(login, ip) {
    const key = `${norm(login)}|${ip}`
    const until = knownIps.get(key)
    if (until == null) return false
    if (until > now()) return true
    knownIps.delete(key)
    return false
  }

  function remember(login, ip) {
    const key = `${norm(login)}|${ip}`
    knownIps.delete(key)
    knownIps.set(key, now() + knownIpTtlMs)
    if (knownIps.size <= PRUNE_ABOVE) return
    for (const [k, until] of knownIps) if (until <= now()) knownIps.delete(k)
    for (const k of knownIps.keys()) {
      if (knownIps.size <= PRUNE_ABOVE) break
      knownIps.delete(k)
    }
  }

  function blocked(key, limit) {
    const b = live(key)
    return b && b.count >= limit ? { ok: false, retryAfterSec: Math.ceil((b.resetAt - now()) / 1000) } : null
  }

  return {
    /** @returns {{ ok: true } | { ok: false, retryAfterSec: number }} */
    check(login, ip) {
      return (
        blocked(loginIpKey(login, ip), perLoginIp) ??
        blocked(ipKey(ip), perIp) ??
        (isKnown(login, ip) ? null : blocked(loginKey(login), perLogin)) ?? { ok: true }
      )
    },
    /**
     * 401 — неверные данные; 200 — успех сбрасывает «логин + IP» и запоминает IP.
     * Общий счётчик логина успех не сбрасывает: идёт перебор — пусть дождётся окна.
     * Прочее (403 блок, 5xx) не считается.
     */
    recordOutcome(login, ip, status) {
      if (status === 200) {
        buckets.delete(loginIpKey(login, ip))
        remember(login, ip)
        return
      }
      if (status !== 401) return
      prune()
      bump(loginIpKey(login, ip))
      bump(loginKey(login))
      bump(ipKey(ip))
    },
  }
}

export const authFailLimiter = createAuthFailLimiter()
