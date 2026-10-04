import {
  GEMINI_GENERATION_CONFIG,
  GEMINI_GENERATION_CONFIG_RETRY,
  isGeminiReplyIncomplete,
} from '../../src/lib/admin/geminiAnalyticsPrompt.js'
import {
  buildYandexChatRequest,
  extractYandexChatReply,
  formatYandexLlmUserError,
  isIamTokenFresh,
  isYandexLlmRetryable,
  YANDEX_LLM_CHAT_URL,
  YANDEX_METADATA_TOKEN_URL,
  yandexLlmAuthHeader,
} from './iskraLlmCore.js'

const REQUEST_TIMEOUT_MS = 60_000

class YandexLlmError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @type {{ token: string, expiresAt: number } | null} */
let iamCache = null

async function metadataIamToken() {
  if (isIamTokenFresh(iamCache, Date.now())) return iamCache.token
  let data
  try {
    const res = await fetch(YANDEX_METADATA_TOKEN_URL, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new YandexLlmError(401, `metadata token HTTP ${res.status}`)
    data = await res.json()
  } catch (e) {
    throw e instanceof YandexLlmError ? e : new YandexLlmError(401, 'нет токена сервисного аккаунта ВМ')
  }
  const ttlSec = Number(data?.expires_in) || 3600
  iamCache = { token: String(data?.access_token ?? ''), expiresAt: Date.now() + ttlSec * 1000 }
  return iamCache.token
}

async function callModel(cfg, payload, model, generationConfig) {
  const iamToken = cfg.auth === 'metadata' ? await metadataIamToken() : ''
  let res
  try {
    res = await fetch(YANDEX_LLM_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: yandexLlmAuthHeader(cfg, iamToken),
        'x-folder-id': cfg.folderId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildYandexChatRequest(payload, { folderId: cfg.folderId, model, generationConfig })),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    throw new YandexLlmError(0, e?.message || 'network error')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new YandexLlmError(res.status, data?.error?.message || data?.message || res.statusText)
  }
  const reply = extractYandexChatReply(data)
  if (!reply.text) throw new YandexLlmError(502, 'Пустой ответ модели')
  return reply
}

/**
 * @param {{ auth: 'api_key' | 'metadata', apiKey: string, folderId: string, models: string[] }} cfg
 * @param {object} payload from buildGeminiGeneratePayload
 */
export async function callYandexLlm(cfg, payload) {
  const mode = payload.responseMode ?? 'brief'
  const gen = payload.generationConfig ?? GEMINI_GENERATION_CONFIG
  const genRetry = payload.generationConfigRetry ?? GEMINI_GENERATION_CONFIG_RETRY
  let lastErr = null

  for (const model of cfg.models) {
    try {
      let reply = await callModel(cfg, payload, model, gen)
      if (isGeminiReplyIncomplete(reply.text, reply.finishReason, mode)) {
        reply = await callModel(cfg, payload, model, genRetry)
      }
      return { text: reply.text, model }
    } catch (e) {
      lastErr = e
      if (!isYandexLlmRetryable(e?.status ?? 0, e?.message)) break
      await sleep(800)
    }
  }
  throw new Error(formatYandexLlmUserError(lastErr?.status ?? 0, lastErr?.message))
}
