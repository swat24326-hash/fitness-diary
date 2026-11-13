/**
 * Кадр сторис для <img>/<video>: stream URL (видео) или blob: (фото / запасной путь).
 */
import { storyMediaIsStreamFile } from './storyMediaRangeCore.js'

/**
 * @param {{ mime?: string, data?: string, blob?: Blob, src?: string, stream?: boolean }} file
 * @returns {string} URL для src — blob: нужно revoke; /api/story-media — нет
 */
export function storyFrameObjectUrl(file) {
  if (storyMediaIsStreamFile(file)) {
    const src = String(file.src)
    if (src.startsWith('/')) return src
    if (src.startsWith('https://') || src.startsWith('http://') || src.startsWith('blob:')) return src
  }
  const mime = String(file?.mime || 'application/octet-stream')
  if (file?.blob instanceof Blob) {
    const blob = file.blob.type ? file.blob : new Blob([file.blob], { type: mime })
    return URL.createObjectURL(blob)
  }
  const raw = String(file?.data || '')
  const bin = atob(raw)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}

/** @param {string | null | undefined} src */
export function revokeStoryFrameUrl(src) {
  if (src && String(src).startsWith('blob:')) URL.revokeObjectURL(src)
}
