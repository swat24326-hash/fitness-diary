/**
 * ИСКРА: выбор поставщика модели и перевод запроса Gemini-формата в OpenAI-совместимый API Yandex AI Studio.
 * Промпт и снимок строит geminiAnalyticsPrompt.js — здесь только транспорт.
 * Gemini API не обслуживает РФ: с прода на Yandex Cloud ответ возможен только через Yandex AI Studio.
 */

export const YANDEX_LLM_CHAT_URL = 'https://ai.api.cloud.yandex.net/v1/chat/completions'

/** DeepSeek V4 Flash (контекст 1M, РФ-контур) — основная; YandexGPT 5.1 (32k) — запасная. */
export const YANDEX_LLM_DEFAULT_MODELS = ['deepseek-v4-flash', 'yandexgpt-5.1']

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ provider: 'yandex', apiKey: string, folderId: string, models: string[] } | { provider: 'gemini', apiKey: string }}
 */
export function resolveIskraLlmConfig(env) {
  const explicit = String(env.ISKRA_LLM_PROVIDER ?? '').trim().toLowerCase()
  const yandexKey = String(env.YANDEX_LLM_API_KEY ?? '').trim()
  const folderId = String(env.YANDEX_FOLDER_ID ?? '').trim()
  const useYandex = explicit === 'yandex' || (explicit !== 'gemini' && Boolean(yandexKey && folderId))
  if (!useYandex) return { provider: 'gemini', apiKey: String(env.GEMINI_API_KEY ?? '').trim() }
  const preferred = String(env.YANDEX_LLM_MODEL ?? '').trim()
  const models = [...new Set([preferred, ...YANDEX_LLM_DEFAULT_MODELS].filter(Boolean))]
  return { provider: 'yandex', apiKey: yandexKey, folderId, models }
}

/** DeepSeek у Яндекса по умолчанию «размышляет» — платно и до минуты; ИСКРЕ не нужно. */
function modelAcceptsReasoningEffort(model) {
  return String(model).startsWith('deepseek')
}

function partsText(parts) {
  return (Array.isArray(parts) ? parts : []).map((p) => String(p?.text ?? '')).join('')
}

/**
 * @param {{ systemInstruction?: { parts?: { text?: string }[] }, contents?: { role?: string, parts?: { text?: string }[] }[] }} payload
 * @param {{ folderId: string, model: string, generationConfig?: { temperature?: number, maxOutputTokens?: number } }} opts
 */
export function buildYandexChatRequest(payload, opts) {
  const messages = []
  const system = partsText(payload?.systemInstruction?.parts).trim()
  if (system) messages.push({ role: 'system', content: system })
  for (const turn of payload?.contents ?? []) {
    const content = partsText(turn?.parts)
    if (!content) continue
    messages.push({ role: turn?.role === 'model' ? 'assistant' : 'user', content })
  }
  const gen = opts.generationConfig ?? {}
  const body = {
    model: `gpt://${opts.folderId}/${opts.model}/latest`,
    messages,
  }
  if (Number.isFinite(gen.temperature)) body.temperature = gen.temperature
  if (Number.isFinite(gen.maxOutputTokens)) body.max_tokens = gen.maxOutputTokens
  if (modelAcceptsReasoningEffort(opts.model)) body.reasoning_effort = 'none'
  return body
}

/**
 * finish_reason «length» = обрыв по лимиту — как MAX_TOKENS у Gemini (isGeminiReplyIncomplete).
 * @returns {{ text: string, finishReason: string }}
 */
export function extractYandexChatReply(data) {
  const choice = data?.choices?.[0]
  const text = String(choice?.message?.content ?? '').trim()
  const reason = String(choice?.finish_reason ?? '').trim().toLowerCase()
  return { text, finishReason: reason === 'length' ? 'MAX_TOKENS' : reason.toUpperCase() }
}

/** Перебор следующей модели: лимит, перегруз, модель недоступна в каталоге. */
export function isYandexLlmRetryable(status, message) {
  if (status === 429 || status >= 500) return true
  const s = String(message ?? '').toLowerCase()
  return status === 404 || s.includes('not found') || s.includes('unknown model')
}

/** Человеческий текст для админа вместо ответа API. Ключ в текст не попадает. */
export function formatYandexLlmUserError(status, message) {
  if (status === 401 || status === 403) {
    return 'ИСКРА: ключ Yandex AI Studio не принят — проверьте ключ и роль сервисного аккаунта (ai.languageModels.user).'
  }
  if (status === 429) return 'ИСКРА: лимит запросов к модели — подождите 10–20 сек и спросите снова.'
  if (status >= 500 || status === 0) return 'ИСКРА: модель временно недоступна — спросите снова через минуту.'
  const raw = String(message ?? '').trim()
  if (!raw) return 'ИСКРА: не удалось получить ответ модели'
  return raw.length > 220 ? `${raw.slice(0, 217)}…` : raw
}
