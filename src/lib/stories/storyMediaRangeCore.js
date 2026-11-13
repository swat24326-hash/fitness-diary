/**
 * HTTP Range для сторис-видео (чистые функции, без Node crypto).
 */

/**
 * @param {string | null | undefined} header
 * @param {number} size
 * @returns {{ start: number, end: number } | null} null — отдать целиком / заголовок битый
 */
export function storyMediaParseRange(header, size) {
  const total = Math.floor(Number(size) || 0)
  if (total < 1) return null
  const raw = String(header || '').trim()
  if (!raw) return null
  const m = /^bytes=(\d*)-(\d*)$/i.exec(raw)
  if (!m) return null
  let start = m[1] === '' ? NaN : Number(m[1])
  let end = m[2] === '' ? NaN : Number(m[2])
  if (!Number.isFinite(start) && Number.isFinite(end)) {
    // bytes=-N — последние N байт
    const n = Math.min(total, Math.max(0, Math.floor(end)))
    start = total - n
    end = total - 1
  } else {
    if (!Number.isFinite(start) || start < 0) return null
    if (!Number.isFinite(end)) end = total - 1
    end = Math.min(total - 1, Math.floor(end))
    start = Math.floor(start)
  }
  if (start > end || start >= total) return null
  return { start, end }
}

/**
 * @param {{ start: number, end: number, size: number }} p
 */
export function storyMediaContentRange({ start, end, size }) {
  return `bytes ${start}-${end}/${size}`
}

/**
 * Клиентский ответ story-frame: stream URL или старый blob/base64.
 * @param {object | null | undefined} file
 */
export function storyMediaIsStreamFile(file) {
  return Boolean(file?.stream && typeof file?.src === 'string' && file.src.length > 0)
}
