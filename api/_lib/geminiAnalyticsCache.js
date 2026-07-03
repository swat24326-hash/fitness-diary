/** In-memory snapshot cache (Vercel warm instance / Edge isolate). */

const TTL_MS = 8 * 60 * 1000
const MAX_ENTRIES = 48
const store = new Map()

function snapshotCacheKey(clubId, year, month, includeFinance) {
  return `${clubId}:${year}:${month}:${includeFinance !== false ? 1 : 0}`
}

export function getCachedGeminiSnapshot(clubId, year, month, includeFinance = true) {
  const key = snapshotCacheKey(clubId, year, month, includeFinance)
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key)
    return null
  }
  return hit.value
}

export function setCachedGeminiSnapshot(clubId, year, month, snapshot, includeFinance = true) {
  const key = snapshotCacheKey(clubId, year, month, includeFinance)
  store.set(key, { at: Date.now(), value: snapshot })
  if (store.size <= MAX_ENTRIES) return
  const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0]
  if (oldest) store.delete(oldest[0])
}

export function clearGeminiSnapshotCacheForTests() {
  store.clear()
}
