/**
 * Лёгкий редактор сторис: кадр 9:16 и цвет как в Telegram (список ползунков).
 * Чистая математика без DOM — для verify и UI.
 */

/** Как экран сторис в Telegram. */
export const STORY_EDIT_ASPECT = 9 / 16

export const STORY_EDIT_TONE_RANGE = Object.freeze({ min: -40, max: 40, step: 1, def: 0 })
export const STORY_EDIT_FADE_RANGE = Object.freeze({ min: 0, max: 40, step: 1, def: 0 })
export const STORY_EDIT_ENHANCE_RANGE = Object.freeze({ min: 0, max: 100, step: 1, def: 0 })
export const STORY_EDIT_ZOOM = Object.freeze({ min: 1, max: 3, step: 0.05, def: 1 })

/** Совместимость со старыми именами. */
export const STORY_EDIT_BRIGHTNESS = STORY_EDIT_TONE_RANGE
export const STORY_EDIT_CONTRAST = STORY_EDIT_TONE_RANGE
export const STORY_EDIT_SATURATION = STORY_EDIT_TONE_RANGE

/**
 * Все параметры цвета — каждый со своим ползунком, как в Telegram.
 * Улучшение и затемнение — от нуля влево (не bipolar).
 */
export const STORY_EDIT_TONES = Object.freeze([
  { id: 'enhance', label: 'Улучшение', ...STORY_EDIT_ENHANCE_RANGE, bipolar: false },
  { id: 'exposure', label: 'Экспозиция', ...STORY_EDIT_TONE_RANGE, bipolar: true },
  { id: 'contrast', label: 'Контраст', ...STORY_EDIT_TONE_RANGE, bipolar: true },
  { id: 'saturation', label: 'Насыщенность', ...STORY_EDIT_TONE_RANGE, bipolar: true },
  { id: 'warmth', label: 'Теплота', ...STORY_EDIT_TONE_RANGE, bipolar: true },
  { id: 'fade', label: 'Затемнение', ...STORY_EDIT_FADE_RANGE, bipolar: false },
  { id: 'shadows', label: 'Тени', ...STORY_EDIT_TONE_RANGE, bipolar: true },
])

export function clampStoryEdit(n, min, max) {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.min(max, Math.max(min, v))
}

function toneVal(t, key, range) {
  const raw = t?.[key]
  const v = raw == null ? range.def : Number(raw)
  return clampStoryEdit(Number.isFinite(v) ? v : range.def, range.min, range.max)
}

/** Доля 0…100 для ползунка. */
export function storyEditTonePct(value, min, max) {
  const lo = Number(min)
  const hi = Number(max)
  if (!(hi > lo)) return 50
  return ((clampStoryEdit(value, lo, hi) - lo) / (hi - lo)) * 100
}

/**
 * Заливка «от нуля» (центр) для bipolar.
 * @returns {{ start: number, end: number }}
 */
export function storyEditBipolarFill(pct) {
  const p = clampStoryEdit(pct, 0, 100)
  const mid = 50
  if (p >= mid) return { start: mid, end: p }
  return { start: p, end: mid }
}

/**
 * CSS filter для превью и canvas.
 * @param {Record<string, number|undefined>} t
 */
export function storyEditFilterCss(t = {}) {
  const enhance = toneVal(t, 'enhance', STORY_EDIT_ENHANCE_RANGE)
  const exposure = toneVal(t, 'exposure', STORY_EDIT_TONE_RANGE) + enhance * 0.12
  const contrast = toneVal(t, 'contrast', STORY_EDIT_TONE_RANGE) + enhance * 0.1
  const saturation = toneVal(t, 'saturation', STORY_EDIT_TONE_RANGE) + enhance * 0.08
  const warmth = toneVal(t, 'warmth', STORY_EDIT_TONE_RANGE) + enhance * 0.04
  const fade = toneVal(t, 'fade', STORY_EDIT_FADE_RANGE)
  const shadows = toneVal(t, 'shadows', STORY_EDIT_TONE_RANGE) + enhance * 0.06
  /* совместимость: старое поле brightness */
  const legacyBright = t.brightness == null ? 0 : toneVal(t, 'brightness', STORY_EDIT_TONE_RANGE)

  const b = 100 + exposure + legacyBright - fade * 0.35 + shadows * 0.2
  const c = 100 + contrast - fade * 0.25 - Math.max(0, shadows) * 0.1
  const s = 100 + saturation
  const parts = [`brightness(${b}%)`, `contrast(${c}%)`, `saturate(${s}%)`]
  if (warmth > 0) {
    parts.push(`sepia(${warmth * 0.35}%)`)
    parts.push(`hue-rotate(${(-warmth * 0.3).toFixed(1)}deg)`)
  } else if (warmth < 0) {
    parts.push(`hue-rotate(${(-warmth * 0.55).toFixed(1)}deg)`)
    parts.push(`saturate(${100 - warmth * 0.4}%)`)
  }
  return parts.join(' ')
}

/**
 * Область cover 9:16 внутри картинки при зуме и сдвиге.
 * @returns {{ sx: number, sy: number, sw: number, sh: number }}
 */
export function storyEditSourceRect(imgW, imgH, { zoom = 1, ox = 0, oy = 0 } = {}) {
  const w = Math.max(1, Number(imgW) || 1)
  const h = Math.max(1, Number(imgH) || 1)
  const z = clampStoryEdit(zoom, STORY_EDIT_ZOOM.min, STORY_EDIT_ZOOM.max)
  const aspect = STORY_EDIT_ASPECT
  let sw
  let sh
  if (w / h > aspect) {
    sh = h / z
    sw = sh * aspect
  } else {
    sw = w / z
    sh = sw / aspect
  }
  sw = Math.min(w, Math.max(1, sw))
  sh = Math.min(h, Math.max(1, sh))
  const maxX = Math.max(0, w - sw)
  const maxY = Math.max(0, h - sh)
  const nx = clampStoryEdit(ox, -1, 1)
  const ny = clampStoryEdit(oy, -1, 1)
  const sx = maxX * (0.5 + nx * 0.5)
  const sy = maxY * (0.5 + ny * 0.5)
  return {
    sx: clampStoryEdit(sx, 0, maxX),
    sy: clampStoryEdit(sy, 0, maxY),
    sw,
    sh,
  }
}

export function storyEditDefaults() {
  return {
    zoom: STORY_EDIT_ZOOM.def,
    ox: 0,
    oy: 0,
    enhance: STORY_EDIT_ENHANCE_RANGE.def,
    exposure: STORY_EDIT_TONE_RANGE.def,
    contrast: STORY_EDIT_TONE_RANGE.def,
    saturation: STORY_EDIT_TONE_RANGE.def,
    warmth: STORY_EDIT_TONE_RANGE.def,
    fade: STORY_EDIT_FADE_RANGE.def,
    shadows: STORY_EDIT_TONE_RANGE.def,
    strokes: [],
  }
}

export function storyEditPanByDelta(edit, dxNorm, dyNorm) {
  const z = clampStoryEdit(edit?.zoom, STORY_EDIT_ZOOM.min, STORY_EDIT_ZOOM.max)
  const span = Math.max(0.05, 1 / z)
  return {
    ...edit,
    ox: clampStoryEdit((edit?.ox ?? 0) - Number(dxNorm || 0) / span, -1, 1),
    oy: clampStoryEdit((edit?.oy ?? 0) - Number(dyNorm || 0) / span, -1, 1),
  }
}

export function storyEditSetZoom(edit, zoom) {
  return {
    ...edit,
    zoom: clampStoryEdit(zoom, STORY_EDIT_ZOOM.min, STORY_EDIT_ZOOM.max),
  }
}

/**
 * @returns {{ dx: number, dy: number, dw: number, dh: number }}
 */
export function storyEditPreviewDest(canvasW, canvasH, aspect = STORY_EDIT_ASPECT) {
  const tw = Math.max(1, Number(canvasW) || 1)
  const th = Math.max(1, Number(canvasH) || 1)
  const a = Number(aspect) > 0 ? Number(aspect) : STORY_EDIT_ASPECT
  let dw
  let dh
  if (tw / th > a) {
    dh = th
    dw = th * a
  } else {
    dw = tw
    dh = tw / a
  }
  return {
    dx: (tw - dw) / 2,
    dy: (th - dh) / 2,
    dw,
    dh,
  }
}
