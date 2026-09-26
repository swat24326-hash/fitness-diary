/**
 * Роль из public.users: ошибка запроса к облаку ≠ «у человека нет роли».
 * На Hybrid A (РФ → US) пачка параллельных select даёт пустой профиль → ложный 403.
 */

export const AUTH_PROFILE_MEMO_TTL_MS = 30_000
export const AUTH_PROFILE_MEMO_MAX = 200
export const AUTH_PROFILE_STALE_MAX_MS = 5 * 60_000
export const AUTH_PROFILE_RETRY_DELAY_MS = 400
export const AUTH_PROFILE_QUERY_TIMEOUT_MS = 8_000
export const AUTH_PROFILE_CLOUD_UNAVAILABLE_RU = 'Облако не ответило — повторите через несколько секунд'

/**
 * Форма server key без раскрытия секрета: настоящий JWT или заглушка.
 * @param {unknown} key
 * @returns {'ok' | 'missing' | 'placeholder'}
 */
export function classifyServiceRoleKeyShape(key) {
  const raw = String(key ?? '').trim()
  if (!raw) return 'missing'
  if (raw.startsWith('eyJ') && raw.length >= 80) return 'ok'
  return 'placeholder'
}

/**
 * @param {{ data?: object | null, error?: { message?: string } | null } | null | undefined} queryResult
 * @returns {{ kind: 'ok' | 'query_error', profile: object | null, message: string | null }}
 */
export function interpretUsersProfileQuery(queryResult) {
  const err = queryResult?.error
  if (err) {
    const message = String(err.message ?? '').trim() || AUTH_PROFILE_CLOUD_UNAVAILABLE_RU
    return { kind: 'query_error', profile: null, message }
  }
  return { kind: 'ok', profile: queryResult?.data ?? null, message: null }
}

/**
 * @param {'ok' | 'query_error' | string} kind
 * @returns {number}
 */
export function httpStatusForAuthProfileQuery(kind) {
  return kind === 'query_error' ? 503 : 200
}

/**
 * @param {unknown} userId
 * @param {{ flags?: object, at?: number } | null | undefined} hit
 * @param {number} now
 * @param {number} [ttlMs]
 */
export function readAuthProfileMemoHit(userId, hit, now, ttlMs = AUTH_PROFILE_MEMO_TTL_MS, staleMaxMs = 0) {
  const key = String(userId ?? '').trim()
  if (!key || !hit) return null
  const age = now - Number(hit.at ?? 0)
  if (age <= ttlMs) return hit.flags ? hit.flags : null
  if (staleMaxMs > 0 && age <= staleMaxMs && hit.flags) return hit.flags
  return null
}

/**
 * Один запрос роли на пачку параллельных /api — не открывать второй в облако.
 * @template T
 * @param {Map<string, Promise<T>>} inflight
 * @param {unknown} key
 * @param {() => Promise<T>} start
 * @returns {Promise<T>}
 */
export function coalesceByKey(inflight, key, start) {
  const id = String(key ?? '').trim()
  if (!id) return start()
  const existing = inflight.get(id)
  if (existing) return existing
  const started = start()
  inflight.set(id, started)
  started.finally(() => {
    if (inflight.get(id) === started) inflight.delete(id)
  })
  return started
}
