/**
 * Фото профиля с телефона: открыть файл, вырезать квадрат по окну обрезки, ужать в JPEG 384 px.
 * Перерисовка на canvas убирает метаданные снимка (геолокация, модель телефона). Браузерный модуль; лимиты — avatarCore.js.
 */
import { decodeImage, readBase64 } from '../chat/chatAttachPrepare.js'
import { AVATAR_BAD_RU, AVATAR_MAX_BYTES, AVATAR_SIDE } from './avatarCore.js'
import { clampCrop } from './avatarCropCore.js'

/** @returns {Promise<{ img: ImageBitmap | HTMLImageElement, url: string, w: number, h: number }>} url — для окна обрезки, освободить после */
export async function openAvatarImage(file) {
  if (!file || !String(file.type).startsWith('image/') || file.type === 'image/svg+xml') throw new Error(AVATAR_BAD_RU)
  let img
  try {
    img = await decodeImage(file)
  } catch {
    throw new Error(AVATAR_BAD_RU)
  }
  if (!(img.width > 0 && img.height > 0)) throw new Error(AVATAR_BAD_RU)
  return { img, url: URL.createObjectURL(file), w: img.width, h: img.height }
}

/** @returns {Promise<string>} base64 JPEG для avatar-set */
export async function encodeAvatar(img, crop) {
  const { sx, sy, side } = clampCrop({ w: img.width, h: img.height, ...crop })
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIDE
  canvas.height = AVATAR_SIDE
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, AVATAR_SIDE, AVATAR_SIDE)
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE)
  for (const quality of [0.86, 0.72, 0.6]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= AVATAR_MAX_BYTES) return readBase64(blob)
  }
  throw new Error(AVATAR_BAD_RU)
}
