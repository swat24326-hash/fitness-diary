import { yandexLlmAuthHeader } from './iskraLlmCore.js'
import { metadataIamToken } from './yandexIamToken.js'
import {
  buildYandexSttRequest,
  parseYandexSttResult,
  YANDEX_OPERATION_URL,
  YANDEX_STT_RESULT_URL,
  YANDEX_STT_START_URL,
} from './yandexSttCore.js'

/** Телефон ждёт ответа 15 с — успеваем раньше. Фраза до 25 с распознаётся за 2–4 с. */
const DEADLINE_MS = 12_000
const POLL_MS = 400

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Голос → текст через SpeechKit (токен сервисного аккаунта ВМ или API-ключ, как у голоса ИСКРЫ).
 * Звук нигде не храним; в лог — только код ошибки, без текста.
 * @param {{ auth: 'api_key' | 'metadata', apiKey: string, folderId: string }} cfg
 * @returns {Promise<{ ok: true, text: string } | { ok: false, error: string }>}
 */
export async function recognizeYandexStt(cfg, base64, rate) {
  const until = Date.now() + DEADLINE_MS
  const left = () => Math.max(1_000, until - Date.now())
  try {
    const iamToken = cfg.auth === 'metadata' ? await metadataIamToken() : ''
    const headers = { Authorization: yandexLlmAuthHeader(cfg, iamToken), 'x-folder-id': cfg.folderId }
    const started = await fetch(YANDEX_STT_START_URL, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildYandexSttRequest(base64, rate)),
      signal: AbortSignal.timeout(left()),
    })
    if (!started.ok) return { ok: false, error: `stt_start_http_${started.status}` }
    const id = String((await started.json())?.id ?? '')
    if (!id) return { ok: false, error: 'stt_no_operation' }
    for (;;) {
      if (Date.now() >= until) return { ok: false, error: 'stt_timeout' }
      await sleep(POLL_MS)
      const op = await fetch(`${YANDEX_OPERATION_URL}/${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(left()) })
      if (!op.ok) return { ok: false, error: `stt_operation_http_${op.status}` }
      const state = await op.json()
      if (state?.error) return { ok: false, error: `stt_operation_${state.error.code ?? 'error'}` }
      if (state?.done) break
    }
    const result = await fetch(`${YANDEX_STT_RESULT_URL}?operationId=${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(left()) })
    if (!result.ok) return { ok: false, error: `stt_result_http_${result.status}` }
    return { ok: true, text: parseYandexSttResult(await result.text()) }
  } catch (e) {
    return { ok: false, error: e?.name === 'TimeoutError' ? 'stt_timeout' : 'stt_failed' }
  }
}
