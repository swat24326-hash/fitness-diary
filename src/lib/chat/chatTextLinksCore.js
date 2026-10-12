/**
 * Текст сообщения → куски для экрана: сайты (с https:// и без — «wildberries.ru/…», «www.ozon.ru»),
 * почта и российские телефоны кликабельны. Без React.
 */

const BARE_TLDS = 'ru|su|рф|com|net|org|by|kz|uz|io|me|app|shop|store|pro|info|online|site|club|fit'
const LABEL = '[a-z0-9а-яё-]+'

const LINK_RE = new RegExp(
  [
    String.raw`(?<url>https?:\/\/[^\s<>"]+)`,
    String.raw`(?<email>(?<![\p{L}\d.+_-])[\w.+-]+@${LABEL}(?:\.${LABEL})*\.[a-zа-яё]{2,}(?![\p{L}\d]))`,
    String.raw`(?<bare>(?<![\p{L}\d@./:-])(?:www\.)?${LABEL}(?:\.${LABEL})*\.(?:${BARE_TLDS})(?![\p{L}\d-])(?:\/[^\s<>"]*)?)`,
    String.raw`(?<tel>(?<![\p{L}\d+])(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d))`,
  ].join('|'),
  'giu',
)
const TRAILING_PUNCT_RE = /[.,!?;:)»]+$/

/** «8 (999) 123-45-67» → «tel:+79991234567». */
function telHref(text) {
  const digits = text.replace(/\D/g, '')
  return `tel:+7${digits.slice(1)}`
}

/**
 * @returns {Array<{ text: string, href?: string, kind?: 'url' | 'email' | 'tel' }>}
 */
export function chatTextParts(body) {
  const text = String(body ?? '')
  const parts = []
  let last = 0
  for (const match of text.matchAll(LINK_RE)) {
    const g = match.groups
    let raw = match[0]
    let part
    if (g.url || g.bare) {
      raw = raw.replace(TRAILING_PUNCT_RE, '')
      part = { text: raw, href: g.url ? raw : `https://${raw}`, kind: 'url' }
    } else if (g.email) {
      part = { text: raw, href: `mailto:${raw}`, kind: 'email' }
    } else {
      part = { text: raw, href: telHref(raw), kind: 'tel' }
    }
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push(part)
    last = match.index + raw.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
