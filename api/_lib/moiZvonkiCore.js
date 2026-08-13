/**
 * Клиент REST API «Мои Звонки» (клубные SMS / звонки).
 * Секреты только из env — не логировать api_key.
 */

export const CLUB_SMS_MAX_TEXT_LEN = 500
export const CLUB_SMS_RATE_LIMIT_PER_MIN = 20
export const CLUB_SMS_RATE_WINDOW_MS = 60_000
/** Исходящие звонки клуба (calls.make_call) — отдельный лимит от SMS. */
export const CLUB_CALL_RATE_LIMIT_PER_MIN = 10
export const CLUB_CALL_RATE_WINDOW_MS = 60_000

/** @type {Map<string, number[]>} */
const rateBuckets = new Map()

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {{ apiKey: string, userEmail: string, apiBase: string }}
 */
export function getMoiZvonkiConfigFromEnv(env = process.env) {
  const apiKey = String(env.MOIZVONKI_API_KEY ?? '').trim()
  const userEmail = String(env.MOIZVONKI_USER_EMAIL ?? '').trim()
  let apiBase = String(env.MOIZVONKI_API_BASE ?? '')
    .trim()
    .replace(/\/$/, '')
  if (!apiBase) {
    const domain = String(env.MOIZVONKI_DOMAIN ?? '')
      .trim()
      .toLowerCase()
      .replace(/\.moizvonki\.ru$/i, '')
      .replace(/^https?:\/\//i, '')
    if (domain) apiBase = `https://${domain}.moizvonki.ru/api/v1`
  }
  return { apiKey, userEmail, apiBase }
}

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env] */
export function isMoiZvonkiConfigured(env = process.env) {
  const c = getMoiZvonkiConfigFromEnv(env)
  return Boolean(c.apiKey && c.userEmail && c.apiBase)
}

/**
 * Готов ли переданный конфиг (клуб / env / merge).
 * @param {{ apiKey?: string, userEmail?: string, apiBase?: string } | null | undefined} cfg
 */
export function isMoiZvonkiConfigReady(cfg) {
  return Boolean(cfg?.apiKey && cfg?.userEmail && cfg?.apiBase)
}

/** @param {string | null | undefined} raw */
export function normalizePhoneDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '')
}

/**
 * Номер для Мои Звонки: цифры, РФ → 7XXXXXXXXXX.
 * @param {string | null | undefined} raw
 */
export function normalizeMoiZvonkiPhone(raw) {
  let d = normalizePhoneDigits(raw)
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length === 10) d = `7${d}`
  return d
}

/** @param {string | null | undefined} phone */
export function isValidMoiZvonkiPhone(phone) {
  const d = normalizeMoiZvonkiPhone(phone)
  return d.length >= 11 && d.length <= 15 && /^\d+$/.test(d)
}

/**
 * @param {{ userName: string, apiKey: string, to: string, text: string }} p
 */
export function buildSendSmsRequestPayload(p) {
  const text = String(p.text ?? '').trim().slice(0, CLUB_SMS_MAX_TEXT_LEN)
  return {
    user_name: String(p.userName ?? '').trim(),
    api_key: String(p.apiKey ?? '').trim(),
    action: 'calls.send_sms',
    to: normalizeMoiZvonkiPhone(p.to),
    text,
  }
}

/**
 * Исходящий звонок с Android клуба.
 * @param {{ userName: string, apiKey: string, to: string }} p
 */
export function buildMakeCallRequestPayload(p) {
  return {
    user_name: String(p.userName ?? '').trim(),
    api_key: String(p.apiKey ?? '').trim(),
    action: 'calls.make_call',
    to: normalizeMoiZvonkiPhone(p.to),
  }
}

/** @param {Record<string, unknown>} payload */
export function buildMoiZvonkiFormBody(payload) {
  return new URLSearchParams({ request_data: JSON.stringify(payload) }).toString()
}

/**
 * @param {string} key
 * @param {{ now?: number, limit?: number, windowMs?: number }} [opts]
 * @returns {{ ok: true } | { ok: false, error: string, retry_after_sec: number }}
 */
export function checkClubSmsRateLimit(key, opts = {}) {
  const now = opts.now ?? Date.now()
  const limit = opts.limit ?? CLUB_SMS_RATE_LIMIT_PER_MIN
  const windowMs = opts.windowMs ?? CLUB_SMS_RATE_WINDOW_MS
  const id = String(key || 'default')
  const prev = rateBuckets.get(id) ?? []
  const fresh = prev.filter((t) => now - t < windowMs)
  if (fresh.length >= limit) {
    const oldest = fresh[0] ?? now
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000))
    rateBuckets.set(id, fresh)
    return { ok: false, error: 'too_many_sms', retry_after_sec: retryAfterSec }
  }
  fresh.push(now)
  rateBuckets.set(id, fresh)
  return { ok: true }
}

/** Сброс для verify-скриптов. */
export function resetClubSmsRateLimitForTests() {
  rateBuckets.clear()
}

/**
 * @param {number} status
 * @param {unknown} body
 */
export function mapMoiZvonkiHttpErrorToRu(status, body) {
  const raw =
    typeof body === 'string'
      ? body
      : body && typeof body === 'object'
        ? String(/** @type {{ error?: string, message?: string }} */ (body).error ??
            /** @type {{ message?: string }} */ (body).message ??
            '')
        : ''
  if (status === 401 || status === 403) {
    return 'Мои Звонки: ошибка авторизации. Проверьте email и API-ключ в env.'
  }
  if (status === 404) return 'Мои Звонки: неверный адрес API (домен).'
  if (status >= 500) return 'Мои Звонки временно недоступны. Попробуйте позже.'
  if (/confirm|подтверд/i.test(raw)) {
    return 'Подтвердите действие в приложении на телефоне клуба (или включите режим без подтверждения).'
  }
  if (raw.trim()) return `Мои Звонки: ${raw.trim().slice(0, 160)}`
  return 'Не удалось выполнить запрос к Мои Звонки.'
}

/**
 * @param {string} key
 * @param {{ now?: number, limit?: number, windowMs?: number }} [opts]
 */
export function checkClubCallRateLimit(key, opts = {}) {
  const result = checkClubSmsRateLimit(key, {
    now: opts.now,
    limit: opts.limit ?? CLUB_CALL_RATE_LIMIT_PER_MIN,
    windowMs: opts.windowMs ?? CLUB_CALL_RATE_WINDOW_MS,
  })
  if (result.ok) return result
  return {
    ok: false,
    error: 'too_many_calls',
    retry_after_sec: result.retry_after_sec,
  }
}

/**
 * @param {{
 *   to: string,
 *   text: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   config?: { apiKey: string, userEmail: string, apiBase: string } | null,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<{ ok: true, phone: string } | { ok: false, error: string, code?: string }>}
 */
export async function sendMoiZvonkiSms(opts) {
  const env = opts.env ?? process.env
  const cfg = opts.config ?? getMoiZvonkiConfigFromEnv(env)
  if (!isMoiZvonkiConfigReady(cfg)) {
    return {
      ok: false,
      code: 'not_configured',
      error:
        'Мои Звонки не настроены для клуба (Структура → Max и SMS) и нет запасного MOIZVONKI_* в env.',
    }
  }
  if (!isValidMoiZvonkiPhone(opts.to)) {
    return { ok: false, code: 'bad_phone', error: 'Некорректный номер телефона клиента' }
  }
  const text = String(opts.text ?? '').trim()
  if (!text) {
    return { ok: false, code: 'empty_text', error: 'Пустой текст SMS' }
  }

  const payload = buildSendSmsRequestPayload({
    userName: cfg.userEmail,
    apiKey: cfg.apiKey,
    to: opts.to,
    text,
  })
  const body = buildMoiZvonkiFormBody(payload)
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    return { ok: false, code: 'no_fetch', error: 'Fetch недоступен на сервере' }
  }

  let res
  try {
    res = await fetchImpl(cfg.apiBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
      },
      body,
    })
  } catch {
    return { ok: false, code: 'network', error: 'Нет связи с Мои Звонки. Проверьте сеть сервера.' }
  }

  const rawText = await res.text().catch(() => '')
  let parsed = null
  if (rawText) {
    try {
      parsed = JSON.parse(rawText)
    } catch {
      parsed = rawText
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      code: 'http_error',
      error: mapMoiZvonkiHttpErrorToRu(res.status, parsed ?? rawText),
    }
  }

  return { ok: true, phone: payload.to }
}

/**
 * @param {{
 *   to: string,
 *   env?: NodeJS.ProcessEnv | Record<string, string | undefined>,
 *   config?: { apiKey: string, userEmail: string, apiBase: string } | null,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<{ ok: true, phone: string } | { ok: false, error: string, code?: string }>}
 */
export async function sendMoiZvonkiCall(opts) {
  const env = opts.env ?? process.env
  const cfg = opts.config ?? getMoiZvonkiConfigFromEnv(env)
  if (!isMoiZvonkiConfigReady(cfg)) {
    return {
      ok: false,
      code: 'not_configured',
      error:
        'Мои Звонки не настроены для клуба (Структура → Max и SMS) и нет запасного MOIZVONKI_* в env.',
    }
  }
  if (!isValidMoiZvonkiPhone(opts.to)) {
    return { ok: false, code: 'bad_phone', error: 'Некорректный номер телефона клиента' }
  }

  const payload = buildMakeCallRequestPayload({
    userName: cfg.userEmail,
    apiKey: cfg.apiKey,
    to: opts.to,
  })
  const body = buildMoiZvonkiFormBody(payload)
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    return { ok: false, code: 'no_fetch', error: 'Fetch недоступен на сервере' }
  }

  let res
  try {
    res = await fetchImpl(cfg.apiBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/plain, */*',
      },
      body,
    })
  } catch {
    return { ok: false, code: 'network', error: 'Нет связи с Мои Звонки. Проверьте сеть сервера.' }
  }

  const rawText = await res.text().catch(() => '')
  let parsed = null
  if (rawText) {
    try {
      parsed = JSON.parse(rawText)
    } catch {
      parsed = rawText
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      code: 'http_error',
      error: mapMoiZvonkiHttpErrorToRu(res.status, parsed ?? rawText),
    }
  }

  return { ok: true, phone: payload.to }
}
