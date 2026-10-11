/**
 * Листание Ежедневника пальцем вбок (телефон, как в Google Календаре): экран тянется за пальцем,
 * отпустили дальше порога или быстрым взмахом — соседний период, иначе пружинит обратно.
 */

/** Сдвиг, после которого понятно, куда ведёт палец: вбок (листаем) или вверх-вниз (часы). */
export const SWIPE_AXIS_LOCK_PX = 10
/** Доля ширины экрана, после которой отпускание листает. */
export const SWIPE_COMMIT_SHARE = 0.25
/** Быстрый взмах листает и с коротким ходом. */
export const SWIPE_FLICK_MIN_PX = 40
export const SWIPE_FLICK_PX_PER_MS = 0.4

/**
 * @param {number} dx
 * @param {number} dy
 * @returns {'x' | 'y' | null} null — пока рано решать
 */
export function resolveSwipeAxis(dx, dy) {
  const ax = Math.abs(Number(dx) || 0)
  const ay = Math.abs(Number(dy) || 0)
  if (Math.max(ax, ay) < SWIPE_AXIS_LOCK_PX) return null
  return ax > ay ? 'x' : 'y'
}

/**
 * Палец влево — вперёд по времени (как перелистнуть страницу).
 * @param {{ dx: number, width: number, ms: number }} gesture
 * @returns {'next' | 'prev' | null}
 */
export function resolveSwipeCommit({ dx, width, ms }) {
  const shift = Number(dx) || 0
  const dist = Math.abs(shift)
  if (!dist) return null
  const w = Math.max(1, Number(width) || 1)
  const speed = dist / Math.max(1, Number(ms) || 1)
  const far = dist >= w * SWIPE_COMMIT_SHARE
  const flick = dist >= SWIPE_FLICK_MIN_PX && speed >= SWIPE_FLICK_PX_PER_MS
  if (!far && !flick) return null
  return shift < 0 ? 'next' : 'prev'
}
