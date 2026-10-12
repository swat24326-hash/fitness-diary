/**
 * Access-Control-Allow-Origin для `/api/*`: на проде только свой домен (`PUBLIC_ORIGIN`), иначе `*`
 * (локальный dev / стенд без PUBLIC_ORIGIN). Свой фронт ходит same-origin — CORS ему не нужен.
 * @param {Record<string, string | undefined>} [env]
 */
export function resolveCorsOrigin(env = process.env) {
  const origin = String(env.PUBLIC_ORIGIN ?? '').trim().replace(/\/+$/, '')
  return /^https?:\/\/[^/\s]+$/i.test(origin) ? origin : '*'
}
