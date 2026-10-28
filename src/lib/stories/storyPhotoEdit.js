/**
 * Применить кадрирование и цветокоррекцию к фото сторис → JPEG Blob.
 * Превью рисуем на canvas тем же кадром — без CSS transform/filter (чёрный экран в WebView).
 * zoom=1 — вся картинка в 9:16 (поля чёрные); дальше приближение.
 */
import { STORY_PHOTO_MAX_BYTES } from './storyClubCore.js'
import {
  STORY_EDIT_ASPECT,
  storyEditApplyFilterRgba,
  storyEditFilterCss,
  storyEditFilterIsNeutral,
  storyEditImageDest,
  storyEditPreviewDest,
} from './storyEditCore.js'
import { paintStoryDrawStrokes } from './storyEditDraw.js'
import { blobToStoryPhotoFrame } from './storyPhotoPrepare.js'

const OUT_MAX = 1600
const START_Q = 0.86
const MIN_Q = 0.52

/** Кэш: iPhone/WebKit часто имеет ctx.filter, но картинка визуально не меняется. */
let canvasFilterOk = null

function isAppleTouchUa() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iP(hone|od|ad)/i.test(ua)) return true
  /* iPad «как Mac» */
  return navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1
}

/**
 * Реально ли ctx.filter меняет пиксели (не только «есть свойство»).
 * На iPhone всегда false — тон через storyEditApplyFilterRgba.
 */
export function storyEditCanvasFilterWorks() {
  if (canvasFilterOk != null) return canvasFilterOk
  if (typeof document === 'undefined' || isAppleTouchUa()) {
    canvasFilterOk = false
    return false
  }
  try {
    const src = document.createElement('canvas')
    src.width = 1
    src.height = 1
    const sctx = src.getContext('2d')
    if (!sctx) {
      canvasFilterOk = false
      return false
    }
    sctx.fillStyle = '#ffffff'
    sctx.fillRect(0, 0, 1, 1)
    const dst = document.createElement('canvas')
    dst.width = 1
    dst.height = 1
    const x = dst.getContext('2d')
    if (!x || typeof x.filter !== 'string') {
      canvasFilterOk = false
      return false
    }
    x.filter = 'brightness(0%)'
    x.drawImage(src, 0, 0)
    x.filter = 'none'
    const [r] = x.getImageData(0, 0, 1, 1).data
    canvasFilterOk = r < 8
  } catch {
    canvasFilterOk = false
  }
  return canvasFilterOk
}

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

function paintIntoFrame(ctx, img, edit, dx, dy, dw, dh) {
  const iw = img.naturalWidth || img.width || 1
  const ih = img.naturalHeight || img.height || 1
  const layout = storyEditImageDest(iw, ih, dw, dh, edit)
  const x0 = Math.max(0, Math.floor(dx))
  const y0 = Math.max(0, Math.floor(dy))
  const rw = Math.max(1, Math.ceil(dw))
  const rh = Math.max(1, Math.ceil(dh))
  ctx.save()
  ctx.beginPath()
  ctx.rect(dx, dy, dw, dh)
  ctx.clip()
  const filterOk = storyEditCanvasFilterWorks()
  if (filterOk) {
    try {
      ctx.filter = storyEditFilterCss(edit)
    } catch {
      ctx.filter = 'none'
    }
  } else {
    ctx.filter = 'none'
  }
  ctx.drawImage(img, 0, 0, iw, ih, dx + layout.dx, dy + layout.dy, layout.dw, layout.dh)
  ctx.filter = 'none'
  /* iPhone: ползунки ездят, а ctx.filter молчит — дожимаем тон по пикселям */
  if (!filterOk && !storyEditFilterIsNeutral(edit)) {
    try {
      const maxW = ctx.canvas?.width || rw
      const maxH = ctx.canvas?.height || rh
      const w = Math.min(rw, Math.max(1, maxW - x0))
      const h = Math.min(rh, Math.max(1, maxH - y0))
      const imageData = ctx.getImageData(x0, y0, w, h)
      storyEditApplyFilterRgba(imageData.data, edit)
      ctx.putImageData(imageData, x0, y0)
    } catch {
      /* tainted / нет getImageData — оставляем без тона */
    }
  }
  paintStoryDrawStrokes(ctx, edit.strokes, dx, dy, dw, dh)
  ctx.restore()
}

/**
 * Живое превью редактора = тот же кадр, что уйдёт в ленту.
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasImageSource & { naturalWidth?: number, naturalHeight?: number, width: number, height: number }} img
 * @param {{ zoom?: number, ox?: number, oy?: number }} edit
 * @param {HTMLElement | null} [stageEl]
 */
export function paintStoryEditPreview(canvas, img, edit = {}, stageEl = null) {
  if (!canvas || !img) return
  const box = stageEl?.getBoundingClientRect?.()
  const cssW = Math.max(1, Math.round(box?.width || canvas.clientWidth || canvas.width || 1))
  const cssH = Math.max(1, Math.round(box?.height || canvas.clientHeight || canvas.height || 1))
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  const tw = Math.max(1, Math.round(cssW * dpr))
  const th = Math.max(1, Math.round(cssH * dpr))
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw
    canvas.height = th
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { dx, dy, dw, dh } = storyEditPreviewDest(tw, th)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, tw, th)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, tw, th)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  paintIntoFrame(ctx, img, edit, dx, dy, dw, dh)
}

/**
 * @param {string} objectUrl
 * @param {{ zoom?: number, ox?: number, oy?: number }} edit
 * @returns {Promise<{ data: string, w: number, h: number, bytes: number, kind: 'photo' }>}
 */
export async function renderStoryPhotoEdit(objectUrl, edit = {}) {
  const img = await loadImage(objectUrl)
  const h = OUT_MAX
  const w = Math.max(1, Math.round(h * STORY_EDIT_ASPECT))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Фото не открылось — попробуйте другое')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  paintIntoFrame(ctx, img, edit, 0, 0, w, h)

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
