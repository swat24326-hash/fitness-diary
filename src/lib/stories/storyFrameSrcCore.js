/**
 * Кадр сторис для <img>/<video>: blob: URL.
 * Видео приходит Blob с API; фото — base64 в JSON (маленькое).
 */

/**
 * @param {{ mime?: string, data?: string, blob?: Blob }} file
 * @returns {string} object URL — вызвать URL.revokeObjectURL после использования
 */
export function storyFrameObjectUrl(file) {
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
