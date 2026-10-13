/**
 * Лимит голосового ввода на человека: распознавание платное, а кнопку можно жать скриптом.
 * Окно в памяти процесса — сервер на ВМ один; при нескольких — вынести в базу.
 */

export const CHAT_DICTATE_LIMIT = 20
export const CHAT_DICTATE_WINDOW_MS = 10 * 60 * 1000

/** @param {{ limit?: number, windowMs?: number }} [opts] */
export function createChatDictateLimiter({ limit = CHAT_DICTATE_LIMIT, windowMs = CHAT_DICTATE_WINDOW_MS } = {}) {
  /** @type {Map<string, number[]>} */
  const hits = new Map()
  return {
    /** Засчитать попытку; false — лимит исчерпан. */
    take(key, now = Date.now()) {
      const k = String(key)
      const recent = (hits.get(k) ?? []).filter((t) => now - t < windowMs)
      if (recent.length >= limit) {
        hits.set(k, recent)
        return false
      }
      recent.push(now)
      hits.set(k, recent)
      if (hits.size > 5_000) for (const [other, list] of hits) if (!list.some((t) => now - t < windowMs)) hits.delete(other)
      return true
    },
  }
}
