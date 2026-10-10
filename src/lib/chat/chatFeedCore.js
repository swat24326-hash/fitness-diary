/**
 * Лента в стиле Telegram: плашки дней, пачки подряд идущих сообщений одного автора,
 * галочки «прочитано», крупные смайлики без пузыря. Без React.
 */

import { isChatSticker } from './chatStickerCore.js'

const GROUP_GAP_MS = 5 * 60_000
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const EMOJI_MOD = '(?:\\u{FE0F}|\\p{Emoji_Modifier})*'
const EMOJI_ONE = `\\p{Extended_Pictographic}${EMOJI_MOD}(?:\\u{200D}\\p{Extended_Pictographic}${EMOJI_MOD})*`
const EMOJI_ONLY_RE = new RegExp(`^(?:${EMOJI_ONE}){1,3}$`, 'u')

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** «Сегодня», «Вчера», «9 октября», «9 октября 2025». */
export function chatDayLabelRu(iso, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (dayKey(d) === dayKey(now)) return 'Сегодня'
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (dayKey(d) === dayKey(y)) return 'Вчера'
  const base = `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** 1–3 смайлика без текста — показываем крупно, как в Telegram. */
export function isEmojiOnly(body) {
  const s = String(body ?? '').replace(/\s+/g, '')
  return Boolean(s) && EMOJI_ONLY_RE.test(s)
}

function sameAuthor(a, b) {
  return a.side === b.side && String(a.author_name ?? '') === String(b.author_name ?? '')
}

/**
 * @param {Array<{ id: string, created_at: string, side: string, mine: boolean, author_name?: string, body: string }>} messages по возрастанию
 * @param {{ now?: Date, peerReadAt?: string|null }} [opts] peerReadAt — когда другая сторона открыла диалог
 * @returns {Array<{ type: 'day', key: string, label: string } | ({ type: 'msg', groupStart: boolean, groupEnd: boolean, read: boolean, big: boolean } & object)>}
 */
export function buildChatFeed(messages, opts = {}) {
  const now = opts.now ?? new Date()
  const peer = opts.peerReadAt ? String(opts.peerReadAt) : ''
  const list = messages ?? []
  const out = []
  let lastDay = ''
  list.forEach((m, i) => {
    const d = new Date(m.created_at)
    const day = Number.isNaN(d.getTime()) ? '' : dayKey(d)
    if (day && day !== lastDay) {
      out.push({ type: 'day', key: `day-${day}`, label: chatDayLabelRu(m.created_at, now) })
      lastDay = day
    }
    const prev = list[i - 1]
    const next = list[i + 1]
    const near = (a, b) => a && b && sameAuthor(a, b) && Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < GROUP_GAP_MS
    const sameDay = (a) => a && dayKey(new Date(a.created_at)) === day
    const sticker = isChatSticker(m.sticker) ? m.sticker : null
    out.push({
      ...m,
      sticker,
      type: 'msg',
      groupStart: !(near(prev, m) && sameDay(prev)),
      groupEnd: !(near(m, next) && sameDay(next)),
      read: Boolean(m.mine && peer && String(m.created_at) <= peer),
      big: Boolean(sticker) || isEmojiOnly(m.body),
    })
  })
  return out
}
