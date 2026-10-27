/** Сжать фото сторис в браузере, чтобы пачка из 5 кадров влезла в запрос. */
import { STORY_PHOTO_MAX_BYTES } from './storyClubCore.js'

const MAX_SIDE = 1600
const START_QUALITY = 0.86
const MIN_QUALITY = 0.52

export function blobToStoryPhotoFrame(blob, w, h) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const data = String(reader.result ?? '').split(',')[1] ?? ''
      resolve({ data, w, h, bytes: blob.size })
    }
    reader.onerror = () => reject(new Error('Фото не открылось — попробуйте другое'))
    reader.readAsDataURL(blob)
  })
}

export function prepareStoryPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height, 1))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      const tryQuality = (quality) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Фото не открылось — попробуйте другое'))
            return
          }
          if (blob.size > STORY_PHOTO_MAX_BYTES && quality > MIN_QUALITY) {
            tryQuality(Math.max(MIN_QUALITY, quality - 0.08))
            return
          }
          if (blob.size > STORY_PHOTO_MAX_BYTES) {
            reject(new Error('Фото больше лимита — выберите другое'))
            return
          }
          resolve(await blobToStoryPhotoFrame(blob, w, h))
        }, 'image/jpeg', quality)
      }
      tryQuality(START_QUALITY)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Фото не открылось — попробуйте другое'))
    }
    img.src = url
  })
}
