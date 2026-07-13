import {
  buildGeminiGeneratePayload,
  extractGeminiFinishReason,
  extractGeminiText,
  formatGeminiUserError,
  GEMINI_ANALYTICS_MODEL,
  GEMINI_ANALYTICS_MODELS,
  GEMINI_GENERATION_CONFIG,
  GEMINI_GENERATION_CONFIG_RETRY,
  isGeminiOverloadError,
  isGeminiReplyIncomplete,
  isGeminiRetryableError,
} from '../../src/lib/admin/geminiAnalyticsPrompt.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function modelsToTry() {
  const fromEnv = String(process.env.GEMINI_MODEL ?? process.env.GEMINI_ANALYTICS_MODEL ?? '').trim()
  if (fromEnv) return [fromEnv, ...GEMINI_ANALYTICS_MODELS.filter((m) => m !== fromEnv)]
  return [...GEMINI_ANALYTICS_MODELS]
}

async function callGeminiModel(apiKey, payload, model, generationConfig = GEMINI_GENERATION_CONFIG) {
  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: payload.systemInstruction,
      contents: payload.contents,
      generationConfig,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || 'Gemini API error'
    throw new Error(String(msg))
  }

  const text = extractGeminiText(data)
  const finishReason = extractGeminiFinishReason(data)
  if (!text) throw new Error('Пустой ответ Gemini')
  return { text, finishReason, raw: data, model }
}

async function callGeminiModelWithCompletionRetry(apiKey, payload, model) {
  const gen = payload.generationConfig ?? GEMINI_GENERATION_CONFIG
  const genRetry = payload.generationConfigRetry ?? GEMINI_GENERATION_CONFIG_RETRY
  const mode = payload.responseMode ?? 'brief'
  let result = await callGeminiModel(apiKey, payload, model, gen)
  if (isGeminiReplyIncomplete(result.text, result.finishReason, mode)) {
    await sleep(400)
    result = await callGeminiModel(apiKey, payload, model, genRetry)
  }
  return result
}

/**
 * @param {string} apiKey
 * @param {object} payload from buildGeminiGeneratePayload
 */
export async function callGeminiGenerateContent(apiKey, payload) {
  const key = String(apiKey ?? '').trim()
  if (!key) throw new Error('GEMINI_API_KEY не задан')

  const models = modelsToTry()
  let lastErr = null

  for (let i = 0; i < models.length; i++) {
    const model = models[i]
    const attempts = 2
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        if (attempt > 0) await sleep(1500)
        const result = await callGeminiModelWithCompletionRetry(key, payload, model)
        return { text: result.text, raw: result.raw, model: result.model }
      } catch (e) {
        lastErr = e
        if (!isGeminiRetryableError(e?.message)) {
          throw new Error(formatGeminiUserError(e?.message))
        }
        const overload = isGeminiOverloadError(e?.message)
        if (attempt + 1 < attempts && overload) continue
        break
      }
    }
    if (i + 1 < models.length) await sleep(800)
  }

  throw new Error(formatGeminiUserError(lastErr?.message ?? 'Gemini unavailable'))
}

export { buildGeminiGeneratePayload, extractGeminiText, GEMINI_ANALYTICS_MODEL, GEMINI_ANALYTICS_MODELS }
