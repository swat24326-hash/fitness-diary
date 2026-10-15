/**
 * Кэш экранов приложения клиента (/me) и телефона тренера (/coach), как в Telegram: открыли экран — сразу
 * последнее сохранённое, затем свежее с сервера. Решение владельца 15.10.2026: на телефоне только последние
 * сообщения диалога, стирается при выходе и через 7 дней. Медиа (звук, фото, видео) лента не несёт —
 * они грузятся отдельно по нажатию и в кэш не попадают.
 */
export const SCREEN_CACHE_APPS = Object.freeze(['client', 'coach'])
export const SCREEN_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SCREEN_CACHE_MAX_ENTRIES = 40
export const CHAT_CACHE_MESSAGES = 60

/**
 * @param {string} app 'client' | 'coach'
 * @param {string} screen
 * @param {string} [id]
 * @returns {string} '' — приложение не из списка (кэш выключен)
 */
export function screenCacheKey(app, screen, id = '') {
  if (!SCREEN_CACHE_APPS.includes(app) || !screen) return ''
  return id ? `${app}:${screen}:${id}` : `${app}:${screen}`
}

/** @param {{ savedAt?: number } | null | undefined} entry @param {number} now */
export function isScreenCacheFresh(entry, now) {
  const at = Number(entry?.savedAt)
  return Number.isFinite(at) && at <= now + 60_000 && now - at < SCREEN_CACHE_TTL_MS
}

/**
 * Ключи на удаление: просроченные и всё сверх лимита (самые давно сохранённые).
 * @param {{ key: string, savedAt: number }[]} entries записи одного приложения
 * @param {number} now
 * @param {number} [max]
 */
export function screenCacheEvictKeys(entries, now, max = SCREEN_CACHE_MAX_ENTRIES) {
  const fresh = []
  const out = []
  for (const e of entries) (isScreenCacheFresh(e, now) ? fresh.push(e) : out.push(e.key))
  if (fresh.length <= max) return out
  fresh.sort((a, b) => b.savedAt - a.savedAt)
  return [...out, ...fresh.slice(max).map((e) => e.key)]
}

/**
 * Лента диалога для кэша: последние CHAT_CACHE_MESSAGES сообщений и «есть ли раньше».
 * @param {object[] | null} messages по времени, старые сначала
 * @param {boolean} hasMore
 * @param {object | null} meta
 */
export function chatCacheSnapshot(messages, hasMore, meta) {
  if (!Array.isArray(messages)) return null
  const cut = messages.length > CHAT_CACHE_MESSAGES
  return { messages: cut ? messages.slice(-CHAT_CACHE_MESSAGES) : messages, hasMore: Boolean(hasMore) || cut, meta: meta ?? null }
}

/**
 * Отпечаток снимка: тот же — не переписываем IndexedDB на каждом опросе ленты раз в 10 с.
 * @param {unknown} snapshot
 */
export function screenCacheSignature(snapshot) {
  try {
    return snapshot == null ? '' : JSON.stringify(snapshot)
  } catch {
    return ''
  }
}
