/**
 * Обрезка фото в круг, как в Telegram: квадратное окно, фото двигают пальцем и увеличивают ползунком.
 * Состояние — центр окна в пикселях исходного фото и увеличение (1 — короткая сторона целиком в окне).
 * Без браузера — проверяется verify-profile-avatar.mjs.
 */

export const AVATAR_ZOOM_MAX = 4

/** Сторона окна в пикселях исходного фото. */
export function cropSide(w, h, zoom) {
  const z = Math.min(AVATAR_ZOOM_MAX, Math.max(1, Number(zoom) || 1))
  return Math.min(w, h) / z
}

/**
 * Окно целиком внутри фото: центр прижимаем к краям.
 * @returns {{ sx: number, sy: number, side: number, cx: number, cy: number }}
 */
export function clampCrop({ w, h, zoom, cx, cy }) {
  const side = cropSide(w, h, zoom)
  const half = side / 2
  const x = Math.min(w - half, Math.max(half, Number.isFinite(cx) ? cx : w / 2))
  const y = Math.min(h - half, Math.max(half, Number.isFinite(cy) ? cy : h / 2))
  return { sx: x - half, sy: y - half, side, cx: x, cy: y }
}

/**
 * Палец сдвинулся на dx, dy экранных пикселей при окне viewPx — фото едет за пальцем, центр окна — в обратную сторону.
 */
export function panCrop(crop, dx, dy, viewPx) {
  const { side } = clampCrop(crop)
  const k = side / Math.max(1, viewPx)
  return clampCrop({ ...crop, cx: crop.cx - dx * k, cy: crop.cy - dy * k })
}
