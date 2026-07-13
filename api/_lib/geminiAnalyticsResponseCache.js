/** In-memory кэш ответов Gemini (один вопрос → один ответ, ~8 мин). */

const TTL_MS = 8 * 60 * 1000
const MAX_ENTRIES = 64
const store = new Map()

export function normalizeGeminiCacheMessage(message) {
  return String(message ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
}

function responseCacheKey(clubId, year, month, gender, comparePrevious, userMessage, responseMode = 'brief') {
  const msg = normalizeGeminiCacheMessage(userMessage)
  const mode = String(responseMode ?? 'brief').trim() || 'brief'
  return `${clubId}:${year}:${month}:${gender}:${comparePrevious ? 1 : 0}:${mode}:${msg}`
}

export function getCachedGeminiResponse(clubId, year, month, gender, comparePrevious, userMessage, responseMode = 'brief') {
  const key = responseCacheKey(clubId, year, month, gender, comparePrevious, userMessage, responseMode)
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key)
    return null
  }
  return hit.value
}

export function setCachedGeminiResponse(clubId, year, month, gender, comparePrevious, userMessage, text, responseMode = 'brief') {
  const key = responseCacheKey(clubId, year, month, gender, comparePrevious, userMessage, responseMode)
  store.set(key, { at: Date.now(), value: String(text ?? '').trim() })
  if (store.size <= MAX_ENTRIES) return
  const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0]
  if (oldest) store.delete(oldest[0])
}

export function clearGeminiResponseCacheForTests() {
  store.clear()
}
