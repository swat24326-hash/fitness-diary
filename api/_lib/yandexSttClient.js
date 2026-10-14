import { yandexLlmAuthHeader } from './iskraLlmCore.js'
import { metadataIamToken } from './yandexIamToken.js'
import { buildYandexSttRequest, parseYandexSttResult, YANDEX_OPERATION_URL, YANDEX_STT_RESULT_URL, YANDEX_STT_START_URL } from './yandexSttCore.js'

const TIMEOUT_MS = 10_000

async function sttHeaders(cfg) {
  const iamToken = cfg.auth === 'metadata' ? await metadataIamToken() : ''
  return { Authorization: yandexLlmAuthHeader(cfg, iamToken), 'x-folder-id': cfg.folderId }
}

const failure = (e) => ({ ok: false, error: e?.name === 'TimeoutError' ? 'stt_timeout' : 'stt_failed' })

/**
 * Запустить расшифровку голосового в SpeechKit (токен сервисного аккаунта ВМ или API-ключ, как у голоса ИСКРЫ).
 * Минута звука распознаётся секунды за 10 — ответа не ждём, телефон спрашивает pollYandexStt.
 * @param {{ auth: 'api_key' | 'metadata', apiKey: string, folderId: string }} cfg
 * @returns {Promise<{ ok: true, id: string } | { ok: false, error: string }>}
 */
export async function startYandexStt(cfg, base64) {
  try {
    const res = await fetch(YANDEX_STT_START_URL, {
      method: 'POST',
      headers: { ...(await sttHeaders(cfg)), 'Content-Type': 'application/json' },
      body: JSON.stringify(buildYandexSttRequest(base64)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { ok: false, error: `stt_start_http_${res.status}` }
    const id = String((await res.json())?.id ?? '')
    return id ? { ok: true, id } : { ok: false, error: 'stt_no_operation' }
  } catch (e) {
    return failure(e)
  }
}

/**
 * Готова ли расшифровка; в лог — только код ошибки, без текста.
 * @returns {Promise<{ ok: true, done: false } | { ok: true, done: true, text: string } | { ok: false, error: string }>}
 */
export async function pollYandexStt(cfg, id) {
  try {
    const headers = await sttHeaders(cfg)
    const op = await fetch(`${YANDEX_OPERATION_URL}/${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!op.ok) return { ok: false, error: `stt_operation_http_${op.status}` }
    const state = await op.json()
    if (state?.error) return { ok: false, error: `stt_operation_${state.error.code ?? 'error'}` }
    if (!state?.done) return { ok: true, done: false }
    const result = await fetch(`${YANDEX_STT_RESULT_URL}?operationId=${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!result.ok) return { ok: false, error: `stt_result_http_${result.status}` }
    return { ok: true, done: true, text: parseYandexSttResult(await result.text()) }
  } catch (e) {
    return failure(e)
  }
}
