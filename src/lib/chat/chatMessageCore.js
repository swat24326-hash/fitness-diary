/** Текст сообщения и строки ленты. Без React и без базы — общее для сервера и экрана. */

export const CHAT_BODY_MAX = 2000
export const CHAT_PREVIEW_MAX = 120
export const CHAT_PUSH_PREVIEW_MAX = 80

/** @returns {{ ok: true, body: string } | { ok: false, error: string }} */
export function normalizeChatBody(raw) {
  const body = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!body) return { ok: false, error: 'Напишите сообщение' }
  if (body.length > CHAT_BODY_MAX) return { ok: false, error: `Слишком длинно — не больше ${CHAT_BODY_MAX} символов` }
  return { ok: true, body }
}

/** Одна строка для списка диалогов и пуша. */
export function chatPreview(body, max = CHAT_PREVIEW_MAX) {
  const line = String(body ?? '').replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/**
 * Сообщение для экрана: «моё» — со стороны того, кто смотрит.
 * @param {{ id: string, body: string, sticker?: string|null, created_at: string, author_side: 'client'|'staff', author_user_id?: string|null }} m
 * @param {'client'|'staff'} viewerSide
 * @param {Map<string, string>} staffNames
 */
export function buildChatMessageView(m, viewerSide, staffNames) {
  const staffName = m.author_user_id ? staffNames.get(String(m.author_user_id)) ?? '' : ''
  return {
    id: String(m.id),
    body: m.body,
    sticker: m.sticker ?? null,
    created_at: m.created_at,
    side: m.author_side,
    mine: m.author_side === viewerSide,
    author_name: m.author_side === 'staff' ? staffName : '',
  }
}

/** Ленту отдаём по возрастанию времени; запрос к базе — по убыванию с лимитом. */
export function chronological(messagesDesc) {
  return [...(messagesDesc ?? [])].reverse()
}

/**
 * Склеить ленту на экране со свежей последней страницей (опрос раз в 10 с) или со старой (кнопка «Раньше»).
 * Дубли по id убираем, порядок — по времени.
 */
export function mergeChatMessages(current, incoming) {
  const byId = new Map()
  for (const m of [...(current ?? []), ...(incoming ?? [])]) byId.set(String(m.id), m)
  return [...byId.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}

const URL_RE = /https?:\/\/[^\s<>"]+/gi
const TRAILING_PUNCT_RE = /[.,!?;:)»]+$/

/**
 * Текст → куски для экрана: ссылки http(s) кликабельны (клиенты шлют товары с маркетплейсов).
 * @returns {Array<{ text: string, href?: string }>}
 */
export function chatTextParts(body) {
  const text = String(body ?? '')
  const parts = []
  let last = 0
  for (const match of text.matchAll(URL_RE)) {
    const href = match[0].replace(TRAILING_PUNCT_RE, '')
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ text: href, href })
    last = match.index + href.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/** «14:05» сегодня, «09.10 14:05» в другой день. */
export function chatTimeRu(iso, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d.toDateString() === now.toDateString()) return time
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${time}`
}
