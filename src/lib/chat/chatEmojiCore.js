/** Смайлики для поля ввода: наборы, вставка в позицию курсора. «Часто используемые» — chatEmojiFrequentCore.js. Без React. */
import { CHAT_EMOJI_CATALOG } from './chatEmojiCatalog.js'

/** Разделы как в Telegram (Noto Animated Emoji): смайлы и люди, природа, еда, спорт, путешествия, предметы, символы, флаги. */
export const CHAT_EMOJI_SETS = CHAT_EMOJI_CATALOG

/**
 * Вставить смайлик вместо выделения (или в позицию курсора).
 * @returns {{ text: string, caret: number }}
 */
export function insertEmoji(text, start, end, emoji) {
  const src = String(text ?? '')
  const a = Number.isInteger(start) ? Math.max(0, Math.min(start, src.length)) : src.length
  const b = Number.isInteger(end) ? Math.max(a, Math.min(end, src.length)) : a
  return { text: src.slice(0, a) + emoji + src.slice(b), caret: a + emoji.length }
}