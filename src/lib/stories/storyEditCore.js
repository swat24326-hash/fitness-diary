/**
 * Лёгкий редактор сторис: кадр 9:16 и цветокоррекция.
 * Чистая математика без DOM — для verify и UI.
 */

/** Как экран сторис в Telegram. */
export const STORY_EDIT_ASPECT = 9 / 16

export const STORY_EDIT_BRIGHTNESS = Object.freeze({ min: -40, max: 40, step: 1, def: 0 })
export const STORY_EDIT_CONTRAST = Object.freeze({ min: -40, max: 40, step: 1, def: 0 })
export const STORY_EDIT_SATURATION = Object.freeze({ min: -40, max: 40, step: 1, def: 0 })
export const STORY_EDIT_ZOOM = Object.freeze({ min: 1, max: 3, step: 0.05, def: 1 })

/** Пресеты «на глаз» — один тап вместо крутилок. */
export const STORY_EDIT_PRESETS = Object.freeze([
  { id: 'orig', label: 'Как есть', brightness: 0, contrast: 0, saturation: 0 },
  { id: 'bright', label: 'Ярче', brightness: 18, contrast: 6, saturation: 4 },
  { id: 'punch', label: 'Контраст', brightness: 4, contrast: 22, saturation: 8 },
  { id: 'warm', label: 'Теплее', brightness: 8, contrast: 4, saturation: 16 },
  { id: 'cool', label: 'Холоднее', brightness: 4, contrast: 8, saturation: -12 },
])

export function clampStoryEdit(n, min, max) {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.min(max, Math.max(min, v))
}

/**
 * CSS filter для превью и canvas.
 * @param {{ brightness?: number, contrast?: number, saturation?: number }} t
 */
export function storyEditFilterCss(t = {}) {
  const b = 100 + clampStoryEdit(t.brightness, STORY_EDIT_BRIGHTNESS.min, STORY_EDIT_BRIGHTNESS.max)
  const c = 100 + clampStoryEdit(t.contrast, STORY_EDIT_CONTRAST.min, STORY_EDIT_CONTRAST.max)
  const s = 100 + clampStoryEdit(t.saturation, STORY_EDIT_SATURATION.min, STORY_EDIT_SATURATION.max)
  return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`
}

/**
 * Область cover 9:16 внутри картинки при зуме и сдвиге.
 * ox/oy — доля сдвига центра (−1…1), zoom ≥ 1.
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
    brightness: STORY_EDIT_BRIGHTNESS.def,
    contrast: STORY_EDIT_CONTRAST.def,
    saturation: STORY_EDIT_SATURATION.def,
    preset: 'orig',
    strokes: [],
  }
}

export function storyEditApplyPreset(id) {
  const p = STORY_EDIT_PRESETS.find((x) => x.id === id) ?? STORY_EDIT_PRESETS[0]
  return {
    brightness: p.brightness,
    contrast: p.contrast,
    saturation: p.saturation,
    preset: p.id,
  }
}

/**
 * Сдвиг кадра жестом (как в Telegram): dxNorm/dyNorm — доля ширины/высоты сцены.
 * Пальцем вправо — картинка едет вправо (видим левый край).
 */
export function storyEditPanByDelta(edit, dxNorm, dyNorm) {
  const z = clampStoryEdit(edit?.zoom, STORY_EDIT_ZOOM.min, STORY_EDIT_ZOOM.max)
  const span = Math.max(0.05, 1 / z)
  return {
    ...edit,
    ox: clampStoryEdit((edit?.ox ?? 0) - Number(dxNorm || 0) / span, -1, 1),
    oy: clampStoryEdit((edit?.oy ?? 0) - Number(dyNorm || 0) / span, -1, 1),
  }
}

/** Щипок / кнопки ± — новый zoom, центр кадра тот же. */
export function storyEditSetZoom(edit, zoom) {
  return {
    ...edit,
    zoom: clampStoryEdit(zoom, STORY_EDIT_ZOOM.min, STORY_EDIT_ZOOM.max),
  }
}

/**
 * Куда рисовать кадр 9:16 внутри превью, чтобы не растягивать лицо.
 * Лишние поля — чёрные (letterbox / pillarbox).
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
