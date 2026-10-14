/**
 * Файл с телефона → вложение для отправки. Фото перерисовываем на canvas: ужимаем до 1600 px и JPEG —
 * заодно пропадают метаданные снимка (геолокация, модель телефона). PDF — как есть, если влезает в лимит.
 * Браузерный модуль; правила и лимиты — chatAttachCore.js.
 */
import {
  CHAT_ATTACH_BAD_RU,
  CHAT_ATTACH_BIG_RU,
  CHAT_ATTACH_PHOTO_BAD_RU,
  CHAT_FILE_MAX_BYTES,
  CHAT_PHOTO_MAX_BYTES,
  CHAT_PHOTO_MAX_SIDE,
  cleanAttachName,
  scaleToMaxSide,
} from './chatAttachCore.js'

/** Попытки сжатия: сторона и качество JPEG — первая, что влезла в лимит. */
const PHOTO_STEPS = [
  [CHAT_PHOTO_MAX_SIDE, 0.82],
  [CHAT_PHOTO_MAX_SIDE, 0.68],
  [1280, 0.68],
  [1024, 0.6],
]

function readBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      /* старый Safari не знает опций — ниже через <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(img, side, quality) {
  const size = scaleToMaxSide(img.width, img.height, side)
  const canvas = document.createElement('canvas')
  canvas.width = size.w
  canvas.height = size.h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, size.w, size.h)
  ctx.drawImage(img, 0, 0, size.w, size.h)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? { blob, ...size } : null), 'image/jpeg', quality))
}

async function preparePhoto(file) {
  let img
  try {
    img = await decodeImage(file)
  } catch {
    throw new Error(CHAT_ATTACH_PHOTO_BAD_RU)
  }
  if (!(img.width > 0 && img.height > 0)) throw new Error(CHAT_ATTACH_PHOTO_BAD_RU)
  for (const [side, quality] of PHOTO_STEPS) {
    const out = await encode(img, side, quality)
    if (out && out.blob.size <= CHAT_PHOTO_MAX_BYTES) {
      img.close?.()
      return { kind: 'photo', data: await readBase64(out.blob), w: out.w, h: out.h, bytes: out.blob.size, previewUrl: URL.createObjectURL(out.blob) }
    }
  }
  img.close?.()
  throw new Error(CHAT_ATTACH_PHOTO_BAD_RU)
}

const isPdf = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')

/**
 * @param {File} file
 * @returns {Promise<{ kind: 'photo'|'file', data: string, bytes: number, w?: number, h?: number, name?: string, previewUrl?: string }>}
 * Ошибка — Error с русским текстом для поля ввода.
 */
export async function prepareChatAttach(file) {
  if (!file) throw new Error(CHAT_ATTACH_BAD_RU)
  if (isPdf(file)) {
    if (file.size > CHAT_FILE_MAX_BYTES) throw new Error(CHAT_ATTACH_BIG_RU)
    return { kind: 'file', data: await readBase64(file), name: cleanAttachName(file.name), bytes: file.size }
  }
  if (String(file.type).startsWith('image/') && file.type !== 'image/svg+xml') return preparePhoto(file)
  throw new Error(CHAT_ATTACH_BAD_RU)
}
