/**
 * Свой сервер (C2): лимит тела и заголовки, которые на Vercel даёт платформа.
 */

/** Vercel режет тело на 4,5 МБ — рабочие пакеты push-records на проде всегда меньше. */
export const PORTABLE_MAX_BODY_BYTES_DEFAULT = 5 * 1024 * 1024

export const PAYLOAD_TOO_LARGE_RU = 'Слишком большой запрос — отправьте Sync частями'

/**
 * Permissions-Policy не задаём: пульсометры подключаются через Web Bluetooth.
 * CSP пока report-only — боевой только после проверки PWA/Service Worker на стенде.
 */
export const PORTABLE_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; " +
    "connect-src 'self' https: wss:; font-src 'self' data:; worker-src 'self'; manifest-src 'self'; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
}

/** @param {unknown} raw env MAX_BODY_BYTES */
export function portableMaxBodyBytes(raw) {
  const n = Number(String(raw ?? '').trim())
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : PORTABLE_MAX_BODY_BYTES_DEFAULT
}

/**
 * @param {AsyncIterable<Buffer>} stream
 * @param {number} limit
 * @returns {Promise<{ ok: true, raw: Buffer } | { ok: false }>}
 */
export async function readBodyLimited(stream, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    size += chunk.length
    if (size > limit) return { ok: false }
    chunks.push(chunk)
  }
  return { ok: true, raw: Buffer.concat(chunks) }
}
