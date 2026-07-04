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

function responseCacheKey(clubId, year, month, gender, comparePrevious, userMessage) {
  const msg = normalizeGeminiCacheMessage(userMessage)
  return `${clubId}:${year}:${month}:${gender}:${comparePrevious ? 1 : 0}:${msg}`
}

export function getCachedGeminiResponse(clubId, year, month, gender, comparePrevious, userMessage) {
  const key = responseCacheKey(clubId, year, month, gender, comparePrevious, userMessage)
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key)
    return null
  }
  return hit.value
}

export function setCachedGeminiResponse(clubId, year, month, gender, comparePrevious, userMessage, text) {
  const key = responseCacheKey(clubId, year, month, gender, comparePrevious, userMessage)
  store.set(key, { at: Date.now(), value: String(text ?? '').trim() })
  if (store.size <= MAX_ENTRIES) return
  const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0]
  if (oldest) store.delete(oldest[0])
}

export function clearGeminiResponseCacheForTests() {
  store.clear()
}
