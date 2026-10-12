/**
 * «Часто используемые» смайлики и стикеры, как в Telegram. Без React и хранилища.
 * Считаем при отправке (смайлики из панели и с клавиатуры телефона, стикеры), не при нажатии в панели.
 * Вес использования тает со временем: любимый смайлик не вытесняется одним случайным.
 */
import { splitEmojiText } from './chatEmojiNotoCore.js'

export const CHAT_FREQUENT_MAX = 24
const KEEP_MAX = 200
const HALF_LIFE_DAYS = 30
const DAY_MS = 86_400_000

/** Новичку — набор для зала, пока своих не набралось. */
export const CHAT_FREQUENT_DEFAULT = Object.freeze([
  '💪', '🔥', '👍', '🙏', '😊', '😂', '❤️', '👏',
  '🎉', '😅', '💯', '✅', '🤝', '😍', '🙌', '😉',
  '😎', '🤗', '🥰', '😴', '💧', '🥗', '⏰', '🏆',
])

/** @typedef {{ emoji: Record<string, { n: number, t: number }>, sticker: Record<string, { n: number, t: number }> }} ChatEmojiUsage */

/** @returns {ChatEmojiUsage} */
export function emptyEmojiUsage() {
  return { emoji: {}, sticker: {} }
}

const cleanBucket = (b) =>
  Object.fromEntries(
    Object.entries(b && typeof b === 'object' ? b : {}).filter(
      ([k, v]) => k && Number.isFinite(v?.n) && v.n > 0 && Number.isFinite(v?.t),
    ),
  )

/** Из хранилища: битое — пусто; прежний список «Недавних» (массив) — переносим, порядок сохраняем. */
export function parseEmojiUsage(raw, legacyRecent, now = Date.now()) {
  const usage = emptyEmojiUsage()
  if (raw && typeof raw === 'object') {
    usage.emoji = cleanBucket(raw.emoji)
    usage.sticker = cleanBucket(raw.sticker)
  }
  if (!Object.keys(usage.emoji).length && Array.isArray(legacyRecent)) {
    legacyRecent
      .filter((e) => typeof e === 'string' && e)
      .forEach((e, i) => {
        usage.emoji[e] = { n: 1, t: now - i * 1000 }
      })
  }
  return usage
}

function score(entry, now) {
  const days = Math.max(0, now - entry.t) / DAY_MS
  return entry.n * 0.5 ** (days / HALF_LIFE_DAYS)
}

function ranked(bucket, now) {
  return Object.entries(bucket)
    .sort(([, a], [, b]) => score(b, now) - score(a, now) || b.t - a.t)
    .map(([k]) => k)
}

function bump(bucket, keys, now) {
  const next = { ...bucket }
  for (const k of new Set(keys)) next[k] = { n: (next[k]?.n ?? 0) + 1, t: now }
  const keep = ranked(next, now).slice(0, KEEP_MAX)
  return Object.fromEntries(keep.map((k) => [k, next[k]]))
}

/** Смайлики в тексте сообщения — каждый один раз на сообщение. */
export function emojisInText(text) {
  return [...new Set(splitEmojiText(text).filter((p) => p.key).map((p) => p.text))]
}

/**
 * Отправлено сообщение: текст или стикер.
 * @param {ChatEmojiUsage} usage
 * @param {string | { sticker: string }} sent
 * @returns {ChatEmojiUsage}
 */
export function recordEmojiUsage(usage, sent, now = Date.now()) {
  if (sent && typeof sent === 'object') {
    return sent.sticker ? { ...usage, sticker: bump(usage.sticker, [sent.sticker], now) } : usage
  }
  const found = emojisInText(sent)
  return found.length ? { ...usage, emoji: bump(usage.emoji, found, now) } : usage
}

/** Вкладка «Часто используемые»: свои по весу, остаток — набор для зала. */
export function frequentEmojis(usage, now = Date.now(), max = CHAT_FREQUENT_MAX) {
  const own = ranked(usage?.emoji ?? {}, now).slice(0, max)
  const fill = CHAT_FREQUENT_DEFAULT.filter((e) => !own.includes(e))
  return [...own, ...fill].slice(0, max)
}

/** Стикеры: чаще отправляемые — первыми, остальные в прежнем порядке. */
export function orderStickersByUse(stickers, usage, now = Date.now()) {
  const order = ranked(usage?.sticker ?? {}, now)
  const pos = (id) => {
    const i = order.indexOf(id)
    return i === -1 ? Infinity : i
  }
  return [...stickers].map((s, i) => [s, i]).sort(([a, i], [b, j]) => pos(a.id) - pos(b.id) || i - j).map(([s]) => s)
}
