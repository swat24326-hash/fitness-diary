import {

  buildGeminiGeneratePayload,

  extractGeminiText,

  formatGeminiUserError,

  GEMINI_ANALYTICS_MODEL,

  GEMINI_ANALYTICS_MODELS,
  GEMINI_GENERATION_CONFIG,
  isGeminiOverloadError,

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



async function callGeminiModel(apiKey, payload, model) {

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({

      systemInstruction: payload.systemInstruction,

      contents: payload.contents,

      generationConfig: GEMINI_GENERATION_CONFIG,

    }),

  })



  const data = await res.json().catch(() => ({}))

  if (!res.ok) {

    const msg = data?.error?.message || res.statusText || 'Gemini API error'

    throw new Error(String(msg))

  }



  const text = extractGeminiText(data)

  if (!text) throw new Error('Пустой ответ Gemini')

  return { text, raw: data, model }

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

        return await callGeminiModel(key, payload, model)

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


