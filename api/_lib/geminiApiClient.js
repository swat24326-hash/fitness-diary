import {
  buildGeminiGeneratePayload,
  extractGeminiText,
  GEMINI_ANALYTICS_MODEL,
} from '../../src/lib/admin/geminiAnalyticsPrompt.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * @param {string} apiKey
 * @param {object} payload from buildGeminiGeneratePayload
 */
export async function callGeminiGenerateContent(apiKey, payload) {
  const key = String(apiKey ?? '').trim()
  if (!key) throw new Error('GEMINI_API_KEY не задан')

  const url = `${GEMINI_API_BASE}/models/${GEMINI_ANALYTICS_MODEL}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: payload.systemInstruction,
      contents: payload.contents,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 1024,
      },
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText || 'Gemini API error'
    throw new Error(String(msg))
  }

  const text = extractGeminiText(data)
  if (!text) throw new Error('Пустой ответ Gemini')
  return { text, raw: data }
}

export { buildGeminiGeneratePayload, extractGeminiText, GEMINI_ANALYTICS_MODEL }
