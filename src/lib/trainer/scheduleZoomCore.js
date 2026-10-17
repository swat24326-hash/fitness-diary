/** Масштаб сетки ежедневника: высота часа = 60 × pxPerMin. Щипок, Ctrl+колёсико и кнопки меню. */

export const SCHEDULE_ZOOM_MIN = 0.5
export const SCHEDULE_ZOOM_MAX = 3
export const SCHEDULE_ZOOM_STEPS = [0.5, 0.7, 1, 1.4, 2, 3]
const ENTRY_MIN_HEIGHT_FLOOR = 20

/** Разные экраны — разный масштаб по умолчанию: телефон видит больше часов, чем планшет. */
export const SCHEDULE_ZOOM_DEFAULTS = { tablet: 1.4, phone: 1, admin: 1.4 }

/** @param {string} scope */
export function scheduleZoomStorageKey(scope) {
  return `fd.scheduleZoom.${scope}`
}

/** @param {unknown} value @param {number} fallback */
export function clampScheduleZoom(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(SCHEDULE_ZOOM_MAX, Math.max(SCHEDULE_ZOOM_MIN, Math.round(n * 100) / 100))
}

/** @param {string | null | undefined} raw @param {number} fallback */
export function parseStoredScheduleZoom(raw, fallback) {
  if (raw == null || raw === '') return fallback
  return clampScheduleZoom(raw, fallback)
}

/** Кнопка «+» / «−»: следующий шаг строго больше / меньше текущего. @param {number} current @param {1 | -1} dir */
export function stepScheduleZoom(current, dir) {
  const next =
    dir > 0
      ? SCHEDULE_ZOOM_STEPS.find((s) => s > current + 0.001)
      : [...SCHEDULE_ZOOM_STEPS].reverse().find((s) => s < current - 0.001)
  return next ?? current
}

/** @param {number} startZoom @param {number} startDist @param {number} dist */
export function resolvePinchScheduleZoom(startZoom, startDist, dist) {
  if (!(startDist > 0) || !(dist > 0)) return startZoom
  return clampScheduleZoom(startZoom * (dist / startDist), startZoom)
}

/** Ctrl+колёсико / щипок трекпада: deltaY < 0 — крупнее. @param {number} current @param {number} deltaY */
export function resolveWheelScheduleZoom(current, deltaY) {
  return clampScheduleZoom(current * Math.exp(-Number(deltaY || 0) * 0.002), current)
}

/**
 * scrollTop после смены масштаба, чтобы минута под якорем (пальцы / центр сетки) осталась на месте.
 * @param {{ scrollTop: number, anchorY: number, trackOffset: number, fromZoom: number, toZoom: number }} p
 * anchorY — от верха видимой области сетки; trackOffset — где начинается 00:00 внутри прокрутки.
 */
export function resolveScheduleZoomScrollTop({ scrollTop, anchorY, trackOffset, fromZoom, toZoom }) {
  if (!(fromZoom > 0) || !(toZoom > 0)) return Math.max(0, scrollTop)
  const minute = (scrollTop + anchorY - trackOffset) / fromZoom
  return Math.max(0, Math.round(minute * toZoom + trackOffset - anchorY))
}

/** На мелком масштабе часовая запись не должна наезжать на следующий час. @param {number} base @param {number} zoom */
export function resolveScheduleEntryMinHeight(base, zoom) {
  return Math.min(base, Math.max(ENTRY_MIN_HEIGHT_FLOOR, 60 * zoom - 4))
}

/** Высота, с которой запись вмещает «время» и «имя» двумя строками (с тренером — три строки у админа). */
const ENTRY_TWO_LINE_MIN_PX = { compact: 32, normal: 44, withTrainer: 58 }

/**
 * Высота, с которой под именем ещё читается «№карты · тип абона» (не серый обрубок под overflow).
 * Узкие колонки (compact) мету не показывают — порог не нужен.
 */
const ENTRY_META_MIN_PX = { normal: 56, withTrainer: 72 }

/**
 * Ниже порога запись рисуется в одну строку — только имя (время читается по сетке), иначе имя обрезается и видно только время.
 * @param {number} heightPx @param {{ compact?: boolean, withTrainer?: boolean }} [opts]
 */
export function isScheduleEntryOneLine(heightPx, { compact = false, withTrainer = false } = {}) {
  const need = withTrainer ? ENTRY_TWO_LINE_MIN_PX.withTrainer : compact ? ENTRY_TWO_LINE_MIN_PX.compact : ENTRY_TWO_LINE_MIN_PX.normal
  return Number(heightPx) < need
}

/**
 * Можно ли рисовать строку карты/абона на плитке (не в «3 днях» / неделе).
 * @param {number} heightPx @param {{ compact?: boolean, withTrainer?: boolean }} [opts]
 */
export function isScheduleEntryMetaVisible(heightPx, { compact = false, withTrainer = false } = {}) {
  if (compact) return false
  const need = withTrainer ? ENTRY_META_MIN_PX.withTrainer : ENTRY_META_MIN_PX.normal
  return Number(heightPx) >= need
}

/** «100%» в меню — относительно масштаба экрана по умолчанию. @param {number} zoom @param {number} base */
export function formatScheduleZoomPercent(zoom, base) {
  return `${Math.round((zoom / (base || 1)) * 100)}%`
}
