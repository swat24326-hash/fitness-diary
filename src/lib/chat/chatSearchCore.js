/** Поиск по переписке, как в Telegram: запрос, шаблон для базы, кусок текста вокруг найденного. Без React и без базы. */

export const CHAT_SEARCH_MIN = 2
export const CHAT_SEARCH_MAX = 100
/** Совпадений за один поиск — новые сверху; больше листать по одному никто не станет. */
export const CHAT_SEARCH_LIMIT = 50
export const CHAT_SEARCH_SNIPPET_MAX = 90
export const CHAT_SEARCH_SHORT_RU = `Введите хотя бы ${CHAT_SEARCH_MIN} буквы`
export const CHAT_SEARCH_EMPTY_RU = 'Ничего не нашлось'

/** @returns {{ ok: true, q: string } | { ok: false, error: string }} */
export function normalizeChatSearchQuery(raw) {
  const q = String(raw ?? '')
    .replace(/\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_SEARCH_MAX)
  return q.length >= CHAT_SEARCH_MIN ? { ok: true, q } : { ok: false, error: CHAT_SEARCH_SHORT_RU }
}

/**
 * Значение для `.ilike('body', …)`: «содержит», `%` `_` `\` из запроса — обычные буквы, не шаблон.
 * е/ё → `_` (любая буква): «еще» найдёт «ещё»; лишнее («ащ…») отсекает chatTextMatches.
 */
export function chatSearchPattern(q) {
  return `%${String(q)
    .replace(/[\\%_]/g, (c) => `\\${c}`)
    .replace(/[еёЕЁ]/g, '_')}%`
}

/** «ё» и «е» в русском тексте пишут вперемешку — сравниваем без разницы. */
const fold = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е')

/** Есть ли запрос в тексте (без регистра, ё = е). */
export function chatTextMatches(body, q) {
  return fold(body).includes(fold(q))
}

/**
 * Текст на куски для подсветки найденного в ленте: [{ text, hit }]. Пустой / короткий запрос — один кусок без подсветки.
 * @returns {{ text: string, hit: boolean }[]}
 */
export function splitChatSearchMatches(text, q) {
  const s = String(text ?? '')
  const needle = fold(q)
  if (!s || needle.length < CHAT_SEARCH_MIN) return [{ text: s, hit: false }]
  const hay = fold(s)
  const out = []
  let from = 0
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
    if (at > from) out.push({ text: s.slice(from, at), hit: false })
    out.push({ text: s.slice(at, at + needle.length), hit: true })
    from = at + needle.length
  }
  if (from < s.length) out.push({ text: s.slice(from), hit: false })
  return out
}

/** Шаг по найденному: older=true — к более старому (↑). Списки новые сверху; null — дальше некуда. */
export function nextChatSearchIndex(index, total, older) {
  if (!total) return null
  const next = index + (older ? 1 : -1)
  return next >= 0 && next < total ? next : null
}

/**
 * Кусок текста вокруг первого совпадения одной строкой: «…купил резинку среднюю…».
 * @returns {{ before: string, match: string, after: string }}
 */
export function chatSearchSnippet(body, q, max = CHAT_SEARCH_SNIPPET_MAX) {
  const text = String(body ?? '').replace(/\s+/g, ' ').trim()
  const at = fold(text).indexOf(fold(q))
  if (at < 0) return { before: text.length > max ? `${text.slice(0, max - 1)}…` : text, match: '', after: '' }
  const len = String(q).length
  const room = Math.max(0, max - len)
  const start = Math.max(0, at - Math.floor(room / 3))
  const end = Math.min(text.length, start + len + room)
  return {
    before: `${start > 0 ? '…' : ''}${text.slice(start, at)}`,
    match: text.slice(at, at + len),
    after: `${text.slice(at + len, end)}${end < text.length ? '…' : ''}`,
  }
}

/**
 * Найденное для экрана: кто, когда, кусок текста. message — вид для того, кто смотрит (buildChatMessageView).
 * @param {string} peerName имя собеседника, если у сообщения нет своего author_name
 */
export function buildChatSearchHit(message, q, peerName = '') {
  return {
    id: String(message.id),
    created_at: message.created_at,
    who: message.mine ? 'Вы' : String(message.author_name || peerName || '').trim(),
    snippet: chatSearchSnippet(message.body, q),
  }
}