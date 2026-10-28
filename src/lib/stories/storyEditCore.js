/**
 * Лёгкий редактор сторис: кадр 9:16 и цвет как в Telegram (список ползунков).
 * Чистая математика без DOM — для verify и UI.
 */

/** Как экран сторис в Telegram. */
export const STORY_EDIT_ASPECT = 9 / 16

export const STORY_EDIT_TONE_RANGE = Object.freeze({ min: -70, max: 70, step: 1, def: 0 })
export const STORY_EDIT_FADE_RANGE = Object.freeze({ min: 0, max: 70, step: 1, def: 0 })
export const STORY_EDIT_ENHANCE_RANGE = Object.freeze({ min: 0, max: 100, step: 1, def: 0 })
/** zoom=1 — вся картинка в кадре 9:16 (поля чёрные); дальше приближение до cover и сильнее. */
export const STORY_EDIT_ZOOM = Object.freeze({ min: 1, max: 4, step: 0.05, def: 1 })

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
 * Значение тона по горизонтали жеста (iPhone: нативный range внутри scroll не тянется).
 * @param {number} clientX
 * @param {{ left: number, width: number } | null | undefined} rect
 * @param {{ min: number, max: number, step?: number }} range
 */
export function storyEditToneFromClientX(clientX, rect, range) {
  const lo = Number(range?.min)
  const hi = Number(range?.max)
  const step = Number(range?.step) > 0 ? Number(range.step) : 1
  if (!(hi > lo) || !rect || !(rect.width > 0)) return lo
  const t = clampStoryEdit((Number(clientX) - rect.left) / rect.width, 0, 1)
  const raw = lo + t * (hi - lo)
  const snapped = Math.round(raw / step) * step
  return clampStoryEdit(snapped, lo, hi)
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
 * Параметры тона для CSS filter и запасного пути по пикселям (iOS часто игнорит ctx.filter).
 * @param {Record<string, number|undefined>} t
 * @returns {{ b: number, c: number, s: number, warmth: number }}
 */
export function storyEditFilterParams(t = {}) {
  const enhance = toneVal(t, 'enhance', STORY_EDIT_ENHANCE_RANGE)
  const exposure = toneVal(t, 'exposure', STORY_EDIT_TONE_RANGE) + enhance * 0.22
  const contrast = toneVal(t, 'contrast', STORY_EDIT_TONE_RANGE) + enhance * 0.18
  const saturation = toneVal(t, 'saturation', STORY_EDIT_TONE_RANGE) + enhance * 0.16
  const warmth = toneVal(t, 'warmth', STORY_EDIT_TONE_RANGE) + enhance * 0.08
  const fade = toneVal(t, 'fade', STORY_EDIT_FADE_RANGE)
  const shadows = toneVal(t, 'shadows', STORY_EDIT_TONE_RANGE) + enhance * 0.12
  const legacyBright = t.brightness == null ? 0 : toneVal(t, 'brightness', STORY_EDIT_TONE_RANGE)

  return {
    b: 100 + exposure * 1.45 + legacyBright - fade * 0.55 + shadows * 0.35,
    c: 100 + contrast * 1.45 - fade * 0.4 - Math.max(0, shadows) * 0.2,
    s: 100 + saturation * 1.6,
    warmth,
  }
}

/** Нет правок цвета — можно не гонять пиксели. */
export function storyEditFilterIsNeutral(t = {}) {
  const p = storyEditFilterParams(t)
  return (
    Math.abs(p.b - 100) < 0.05 &&
    Math.abs(p.c - 100) < 0.05 &&
    Math.abs(p.s - 100) < 0.05 &&
    Math.abs(p.warmth) < 0.05
  )
}

/**
 * CSS filter для canvas (Chrome/Android). На части iPhone — no-op, см. storyEditApplyFilterRgba.
 * @param {Record<string, number|undefined>} t
 */
export function storyEditFilterCss(t = {}) {
  const { b, c, s, warmth } = storyEditFilterParams(t)
  const parts = [`brightness(${b}%)`, `contrast(${c}%)`, `saturate(${s}%)`]
  if (warmth > 0) {
    parts.push(`sepia(${Math.min(70, warmth * 0.7)}%)`)
    parts.push(`hue-rotate(${(-warmth * 0.45).toFixed(1)}deg)`)
  } else if (warmth < 0) {
    parts.push(`hue-rotate(${(-warmth * 0.85).toFixed(1)}deg)`)
    parts.push(`saturate(${100 - warmth * 0.7}%)`)
  }
  return parts.join(' ')
}

function clampByte(n) {
  return n < 0 ? 0 : n > 255 ? 255 : n
}

/**
 * Тот же тон, что CSS filter, но по RGBA (когда ctx.filter на устройстве молчит).
 * @param {Uint8ClampedArray | number[]} data
 * @param {Record<string, number|undefined>} edit
 */
export function storyEditApplyFilterRgba(data, edit = {}) {
  if (!data?.length || storyEditFilterIsNeutral(edit)) return data
  const { b, c, s, warmth } = storyEditFilterParams(edit)
  const br = b / 100
  const ct = c / 100
  const sat = s / 100
  const warmAmt = warmth / 100
  /* стандартная матрица saturate как в CSS */
  const sr = 0.213
  const sg = 0.715
  const sb = 0.072
  const r0 = sr + (1 - sr) * sat
  const r1 = sg * (1 - sat)
  const r2 = sb * (1 - sat)
  const g0 = sr * (1 - sat)
  const g1 = sg + (1 - sg) * sat
  const g2 = sb * (1 - sat)
  const b0 = sr * (1 - sat)
  const b1 = sg * (1 - sat)
  const b2 = sb + (1 - sb) * sat

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * br
    let g = data[i + 1] * br
    let bl = data[i + 2] * br
    r = (r - 128) * ct + 128
    g = (g - 128) * ct + 128
    bl = (bl - 128) * ct + 128
    const nr = r * r0 + g * r1 + bl * r2
    const ng = r * g0 + g * g1 + bl * g2
    const nb = r * b0 + g * b1 + bl * b2
    /* теплота: тёплый — больше R, холодный — больше B */
    data[i] = clampByte(nr + warmAmt * 48)
    data[i + 1] = clampByte(ng + warmAmt * 12)
    data[i + 2] = clampByte(nb - warmAmt * 40)
  }
  return data
}

/**
 * Куда положить картинку в кадре 9:16.
 * zoom=1 — contain (весь баннер виден, поля чёрные); больше — приближение.
 * @returns {{ dx: number, dy: number, dw: number, dh: number }}
 */
export function storyEditImageDest(imgW, imgH, outW, outH, { zoom = 1, ox = 0, oy = 0 } = {}) {
  const iw = Math.max(1, Number(imgW) || 1)
  const ih = Math.max(1, Number(imgH) || 1)
  const ow = Math.max(1, Number(outW) || 1)
  const oh = Math.max(1, Number(outH) || 1)
  const z = clampStoryEdit(zoom, STORY_EDIT_ZOOM.min, STORY_EDIT_ZOOM.max)
  const contain = Math.min(ow / iw, oh / ih)
  const dw = iw * contain * z
  const dh = ih * contain * z
  const maxShiftX = Math.max(0, (dw - ow) / 2)
  const maxShiftY = Math.max(0, (dh - oh) / 2)
  const nx = clampStoryEdit(ox, -1, 1)
  const ny = clampStoryEdit(oy, -1, 1)
  return {
    dx: (ow - dw) / 2 - nx * maxShiftX,
    dy: (oh - dh) / 2 - ny * maxShiftY,
    dw,
    dh,
  }
}

/**
 * Зум, при котором картинка впервые закрывает кадр 9:16 (cover).
 * У широкого баннера > 1 — при zoom=1 бока не режутся.
 */
export function storyEditCoverZoom(imgW, imgH, aspect = STORY_EDIT_ASPECT) {
  const iw = Math.max(1, Number(imgW) || 1)
  const ih = Math.max(1, Number(imgH) || 1)
  const a = Number(aspect) > 0 ? Number(aspect) : STORY_EDIT_ASPECT
  const imgAspect = iw / ih
  if (!(imgAspect > 0)) return 1
  if (imgAspect > a) return imgAspect / a
  if (imgAspect < a) return a / imgAspect
  return 1
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
