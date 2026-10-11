/**
 * Смайлики переписки в стиле Telegram: одинаковые картинки Noto на всех устройствах вместо шрифта телефона,
 * крупные — анимацией (Lottie). Файлы с CDN Google; нет сети или смайлика в каталоге — обычный символ. Без React.
 */
import { CHAT_EMOJI_CATALOG } from './chatEmojiCatalog.js'

export const NOTO_EMOJI_BASE = 'https://fonts.gstatic.com/s/e/notoemoji/latest/'

const EMOJI_MOD = '(?:\\u{FE0F}|\\p{Emoji_Modifier})*'
const EMOJI_ONE = `\\p{Extended_Pictographic}${EMOJI_MOD}(?:\\u{200D}\\p{Extended_Pictographic}${EMOJI_MOD})*`
const EMOJI_RE = new RegExp(`${EMOJI_ONE}|\\p{Regional_Indicator}{2}`, 'gu')

function codepoints(emoji) {
  return [...String(emoji ?? '')].map((c) => c.codePointAt(0).toString(16))
}

/** Ключ без FE0F: «❤» и «❤️» — один смайлик. */
function looseKey(emoji) {
  return codepoints(emoji)
    .filter((c) => c !== 'fe0f')
    .join('_')
}

const KEY_BY_LOOSE = new Map(
  CHAT_EMOJI_CATALOG.flatMap((g) => g.items).map((e) => [looseKey(e), codepoints(e).join('_')]),
)

/** Имя папки Noto (например «2764_fe0f») или null — смайлика нет в каталоге. */
export function notoEmojiKey(emoji) {
  return KEY_BY_LOOSE.get(looseKey(emoji)) ?? null
}

export function notoEmojiStaticUrl(key) {
  return `${NOTO_EMOJI_BASE}${key}/emoji.svg`
}

export function notoEmojiLottieUrl(key) {
  return `${NOTO_EMOJI_BASE}${key}/lottie.json`
}

/**
 * Текст → куски: обычный текст и смайлики из каталога (их рисуем картинкой).
 * @returns {Array<{ text: string, key?: string }>}
 */
export function splitEmojiText(text) {
  const src = String(text ?? '')
  const parts = []
  let last = 0
  for (const m of src.matchAll(EMOJI_RE)) {
    const key = notoEmojiKey(m[0])
    if (!key) continue
    if (m.index > last) parts.push({ text: src.slice(last, m.index) })
    parts.push({ text: m[0], key })
    last = m.index + m[0].length
  }
  if (last < src.length) parts.push({ text: src.slice(last) })
  return parts
}
