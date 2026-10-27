/**
 * Применить кадрирование и цветокоррекцию к фото сторис → JPEG Blob.
 * Превью рисуем на canvas тем же кадром — без CSS transform/filter (чёрный экран в WebView).
 */
import { STORY_PHOTO_MAX_BYTES } from './storyClubCore.js'
import { storyEditFilterCss, storyEditSourceRect } from './storyEditCore.js'
import { blobToStoryPhotoFrame } from './storyPhotoPrepare.js'

const OUT_MAX = 1600
const START_Q = 0.86
const MIN_Q = 0.52

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Фото не открылось — попробуйте другое'))
    img.src = src
  })
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Фото не открылось — попробуйте другое'))
      else resolve(blob)
    }, 'image/jpeg', quality)
  })
}

/**
 * Живое превью редактора = тот же кадр, что уйдёт в ленту.
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasImageSource & { naturalWidth?: number, naturalHeight?: number, width: number, height: number }} img
 * @param {{ zoom?: number, ox?: number, oy?: number, brightness?: number, contrast?: number, saturation?: number }} edit
 */
export function paintStoryEditPreview(canvas, img, edit = {}) {
  if (!canvas || !img) return
  const cssW = Math.max(1, canvas.clientWidth || canvas.width || 1)
  const cssH = Math.max(1, canvas.clientHeight || canvas.height || 1)
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  const tw = Math.max(1, Math.round(cssW * dpr))
  const th = Math.max(1, Math.round(cssH * dpr))
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw
    canvas.height = th
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const iw = img.naturalWidth || img.width || 1
  const ih = img.naturalHeight || img.height || 1
  const { sx, sy, sw, sh } = storyEditSourceRect(iw, ih, edit)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, tw, th)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, tw, th)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  try {
    ctx.filter = storyEditFilterCss(edit)
  } catch {
    ctx.filter = 'none'
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th)
  ctx.filter = 'none'
}

/**
 * @param {string} objectUrl
 * @param {{ zoom?: number, ox?: number, oy?: number, brightness?: number, contrast?: number, saturation?: number }} edit
 * @returns {Promise<{ data: string, w: number, h: number, bytes: number, kind: 'photo' }>}
 */
export async function renderStoryPhotoEdit(objectUrl, edit = {}) {
  const img = await loadImage(objectUrl)
  const { sx, sy, sw, sh } = storyEditSourceRect(img.naturalWidth || img.width, img.naturalHeight || img.height, edit)
  const scale = Math.min(1, OUT_MAX / Math.max(sw, sh, 1))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Фото не открылось — попробуйте другое')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.filter = storyEditFilterCss(edit)
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
  ctx.filter = 'none'

  let quality = START_Q
  let blob = await canvasToJpeg(canvas, quality)
  while (blob.size > STORY_PHOTO_MAX_BYTES && quality > MIN_Q) {
    quality = Math.max(MIN_Q, quality - 0.08)
    blob = await canvasToJpeg(canvas, quality)
  }
  if (blob.size > STORY_PHOTO_MAX_BYTES) {
    throw new Error('Фото больше лимита — выберите другое')
  }
  const frame = await blobToStoryPhotoFrame(blob, w, h)
  return { ...frame, kind: 'photo' }
}
