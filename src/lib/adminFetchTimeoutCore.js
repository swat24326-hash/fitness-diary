/**
 * Таймаут GET /api/* для админки: на Vercel короткий (быстрый fallback),
 * на portable / Hybrid A (IP:порт) — длиннее: сервер в РФ ещё ходит в Supabase.
 */

export const VERCEL_ADMIN_FETCH_TIMEOUT_MS = 5_000
export const PORTABLE_ADMIN_FETCH_TIMEOUT_MS = 20_000

/**
 * @param {unknown} origin
 * @returns {boolean}
 */
export function isPortableAdminOrigin(origin) {
  const raw = String(origin ?? '').trim()
  if (!raw) return false
  if (/vercel\.app/i.test(raw)) return false
  const host = raw.replace(/^https?:\/\//i, '').split('/')[0] ?? ''
  if (/:\d{2,5}$/.test(host)) return true
  return /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(host)
}

/**
 * @param {unknown} explicitMs
 * @param {unknown} origin
 * @returns {number}
 */
export function resolveAdminFetchTimeoutMs(explicitMs, origin) {
  const n = Number(explicitMs)
  if (Number.isFinite(n) && n > 0) return n
  return isPortableAdminOrigin(origin) ? PORTABLE_ADMIN_FETCH_TIMEOUT_MS : VERCEL_ADMIN_FETCH_TIMEOUT_MS
}
