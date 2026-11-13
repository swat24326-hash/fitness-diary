/**
 * Кадр сторис для <img>/<video>: blob: URL вместо data: (Safari/iPhone рвёт data: у видео).
 */

/**
 * @param {{ mime?: string, data?: string }} file base64 из story-frame
 * @returns {string} object URL — вызвать URL.revokeObjectURL после использования
 */
export function storyFrameObjectUrl(file) {
  const mime = String(file?.mime || 'application/octet-stream')
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
