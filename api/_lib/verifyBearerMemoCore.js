/**
 * Короткий кэш verifyBearer: главная админки шлёт пачку /api/admin-data,
 * каждый раз getUser() в Supabase с Hybrid (РФ→US) сыпет 401/таймауты.
 */

export const VERIFY_BEARER_MEMO_TTL_MS = 30_000
export const VERIFY_BEARER_MEMO_MAX = 200

/**
 * @param {string} token
 * @param {{ value: { user: object }, at: number }} hit
 * @param {number} now
 * @param {number} [ttlMs]
 */
export function readVerifyBearerMemoHit(token, hit, now, ttlMs = VERIFY_BEARER_MEMO_TTL_MS) {
  const key = String(token ?? '').trim()
  if (!key || !hit) return null
  if (now - Number(hit.at ?? 0) > ttlMs) return null
  return hit.value?.user ? hit.value : null
}

/**
 * @param {Map<string, { value: object, at: number }>} cache
 * @param {number} [max]
 */
export function pruneVerifyBearerMemo(cache, max = VERIFY_BEARER_MEMO_MAX) {
  if (!cache || cache.size <= max) return cache
  const extra = cache.size - max
  let i = 0
  for (const key of cache.keys()) {
    cache.delete(key)
    i += 1
    if (i >= extra) break
  }
  return cache
}
