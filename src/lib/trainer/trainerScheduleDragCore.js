/**
 * Ежедневник: перенос записи долгим нажатием (чистая логика, без DOM).
 */

/** Удержание пальца до «подъёма» записи — короче скролл, длиннее случайный тап. */
export const SCHEDULE_DRAG_HOLD_MS = 400
/** Сдвиг пальца до подъёма = это скролл, перенос не начинаем. */
export const SCHEDULE_DRAG_MOVE_TOLERANCE_PX = 8
export const SCHEDULE_DRAG_SNAP_MIN = 15
export const SCHEDULE_DRAG_AUTOSCROLL_EDGE_PX = 48
export const SCHEDULE_DRAG_AUTOSCROLL_STEP_PX = 14

export const SCHEDULE_DRAG_FREE = 'free'
export const SCHEDULE_DRAG_SAME_DAY = 'same_day'
export const SCHEDULE_DRAG_LOCKED = 'locked'

/**
 * Завершённая тренировка — слот не двигаем (дата тренировки и слота разъедутся).
 * Черновик — только время в тот же день: черновик открывается по своей дате.
 * @param {object | null | undefined} entry
 * @param {object | null | undefined} linkedTraining
 */
export function resolveScheduleDragPolicy(entry, linkedTraining) {
  const linkedId = String(entry?.linked_training_id ?? '').trim()
  if (!linkedId) return SCHEDULE_DRAG_FREE
  if (String(linkedTraining?.status ?? '') === 'completed') return SCHEDULE_DRAG_LOCKED
  return SCHEDULE_DRAG_SAME_DAY
}

/** @param {number} minutes @param {number} [snap] */
export function snapScheduleMinutes(minutes, snap = SCHEDULE_DRAG_SNAP_MIN) {
  const step = Math.max(1, Number(snap) || SCHEDULE_DRAG_SNAP_MIN)
  const raw = Math.round((Number(minutes) || 0) / step) * step
  return Math.min(24 * 60 - step, Math.max(0, raw))
}

/**
 * Начало записи по положению пальца (верх записи = палец минус точка захвата).
 * @param {{ pointerY: number, grabOffsetY: number, trackTop: number, pxPerMin: number, dayStartMin?: number }} p
 */
export function resolveScheduleDragStartMinutes({ pointerY, grabOffsetY, trackTop, pxPerMin, dayStartMin = 0 }) {
  const ppm = Number(pxPerMin) > 0 ? Number(pxPerMin) : 1
  const top = Number(pointerY) - Number(grabOffsetY || 0) - Number(trackTop || 0)
  return snapScheduleMinutes(top / ppm + (Number(dayStartMin) || 0))
}

/**
 * Колонка дня под пальцем; за краями сетки — крайняя колонка.
 * @param {{ left: number, right: number }[]} trackRects
 * @param {number} clientX
 * @param {number} originIndex
 * @param {string} policy
 */
export function resolveScheduleDragDayIndex(trackRects, clientX, originIndex, policy) {
  const rects = trackRects ?? []
  const origin = Math.max(0, Math.min(rects.length - 1, Number(originIndex) || 0))
  if (policy !== SCHEDULE_DRAG_FREE || rects.length <= 1) return origin
  const x = Number(clientX)
  if (!Number.isFinite(x)) return origin
  if (x < rects[0].left) return 0
  if (x > rects[rects.length - 1].right) return rects.length - 1
  for (let i = 0; i < rects.length; i++) {
    const next = rects[i + 1]
    const right = next ? (rects[i].right + next.left) / 2 : rects[i].right
    if (x <= right) return i
  }
  return origin
}

/**
 * Автоскролл у верхнего / нижнего края сетки: −step | 0 | +step.
 * @param {number} pointerY @param {number} boardTop @param {number} boardBottom
 */
export function resolveScheduleAutoScrollDelta(pointerY, boardTop, boardBottom) {
  const y = Number(pointerY)
  if (!Number.isFinite(y)) return 0
  if (y < Number(boardTop) + SCHEDULE_DRAG_AUTOSCROLL_EDGE_PX) return -SCHEDULE_DRAG_AUTOSCROLL_STEP_PX
  if (y > Number(boardBottom) - SCHEDULE_DRAG_AUTOSCROLL_EDGE_PX) return SCHEDULE_DRAG_AUTOSCROLL_STEP_PX
  return 0
}

/** @param {object} entry @param {string} dayIso @param {number} startMinutes */
export function isScheduleMoveNoop(entry, dayIso, startMinutes) {
  return (
    String(entry?.day_date ?? '').slice(0, 10) === String(dayIso ?? '').slice(0, 10) &&
    Number(entry?.start_minutes) === Number(startMinutes)
  )
}
