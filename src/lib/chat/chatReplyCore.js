/** «Ответить» с цитатой, как в Telegram. Без React и без базы — общее для сервера и экрана. */
import { chatPreview, mergeChatMessages } from './chatMessageCore.js'
import { isInboxUuid } from '../inbox/inboxCampaignCore.js'

export const CHAT_REPLY_PREVIEW_MAX = 100
export const CHAT_REPLY_STICKER_RU = 'Стикер'
export const CHAT_REPLY_YOU_RU = 'Вы'
/** Свайп влево по сообщению на телефоне — ответить; вертикаль — это листание ленты. */
export const CHAT_REPLY_SWIPE_PX = 60
const SWIPE_MAX_SLOPE = 0.6

/** id сообщения, на которое отвечают, или null (нет / мусор). */
export function normalizeChatReplyTo(raw) {
  return isInboxUuid(raw) ? String(raw).trim().toLowerCase() : null
}

/**
 * Цитата над ответом из сообщения в виде для экрана (buildChatMessageView / buildStaffDmMessageView).
 * peerName — имя собеседника, если у сообщения нет своего author_name (клиент у сотрудника, коллега).
 * @returns {{ id: string, who: string, text: string, sticker: string|null } | null}
 */
export function buildChatReplyQuote(message, peerName = '') {
  if (!message?.id) return null
  const who = message.mine ? CHAT_REPLY_YOU_RU : String(message.author_name || peerName || '').trim()
  const sticker = message.sticker ?? null
  return {
    id: String(message.id),
    who,
    text: sticker ? CHAT_REPLY_STICKER_RU : chatPreview(message.body, CHAT_REPLY_PREVIEW_MAX),
    sticker,
  }
}

/**
 * Цитата для сообщения ленты: исходное ищем среди загруженных (quoted: id → строка базы).
 * Исходного нет (удалено или не нашлось) — null, ответ показываем без цитаты.
 * @param {(raw: object) => object} toView buildChatMessageView / buildStaffDmMessageView для того, кто смотрит
 */
export function chatReplyQuoteFor(message, quoted, toView, peerName = '') {
  const target = message?.reply_to ? quoted.get(String(message.reply_to)) : null
  return target ? buildChatReplyQuote(toView(target), peerName) : null
}

/** Страниц по 60 — до ~1500 сообщений назад за одно нажатие цитаты; дальше не ищем, чтобы не грузить телефон. */
export const CHAT_REPLY_FIND_MAX_PAGES = 25
export const CHAT_REPLY_NOT_FOUND_RU = 'Исходное сообщение не нашлось — возможно, оно удалено'

/**
 * Нажали цитату старого сообщения: подгружать «Раньше» страницами, пока оно не появится в ленте.
 * Страница пустая или без новых сообщений — истории больше нет, останавливаемся.
 * @param {{ id: string, messages: object[]|null, hasMore: boolean, loadOlder: (before: string) => Promise<{ messages: object[], has_more: boolean }>, maxPages?: number }} p
 * @returns {Promise<{ messages: object[], hasMore: boolean, found: boolean }>}
 */
export async function loadChatHistoryUntil({ id, messages, hasMore, loadOlder, maxPages = CHAT_REPLY_FIND_MAX_PAGES }) {
  let list = messages ?? []
  let more = Boolean(hasMore)
  const has = () => list.some((m) => String(m.id) === String(id))
  for (let i = 0; !has() && more && list.length && i < maxPages; i++) {
    const page = await loadOlder(list[0].created_at)
    const before = list.length
    list = mergeChatMessages(list, page?.messages)
    more = Boolean(page?.has_more) && list.length > before
  }
  return { messages: list, hasMore: more, found: has() }
}

/** Палец ушёл влево достаточно далеко и почти горизонтально. */
export function isChatReplySwipe(dx, dy) {
  return dx <= -CHAT_REPLY_SWIPE_PX && Math.abs(dy) <= Math.abs(dx) * SWIPE_MAX_SLOPE
}

/** Насколько сдвинуть пузырь за пальцем: только влево, не дальше порога с запасом. */
export function chatReplySwipeOffset(dx) {
  return Math.max(Math.min(dx, 0), -CHAT_REPLY_SWIPE_PX * 1.4)
}
