/** Вид мессенджера сотрудников по ширине экрана и ширина колонок, которую человек подвинул на мониторе. */

export const MSGR_PHONE_MAX = 760
export const MSGR_MONITOR_MIN = 1200
export const MSGR_COLS_KEY = 'fd.msgr.cols'

/** Пределы колонок, px: уже — не читается, шире — диалогу не остаётся места. */
export const MSGR_COL_LIMITS = Object.freeze({
  rail: Object.freeze({ min: 160, max: 360 }),
  list: Object.freeze({ min: 260, max: 600 }),
})

/**
 * Телефон — одна панель, планшет — две колонки, монитор — три. compact — экран сам узкий (телефон тренера /coach).
 * @param {{ width: number, compact?: boolean }} p
 * @returns {'phone' | 'tablet' | 'monitor'}
 */
export function messengerModeOf({ width, compact = false }) {
  if (compact || width <= MSGR_PHONE_MAX) return 'phone'
  return width >= MSGR_MONITOR_MIN ? 'monitor' : 'tablet'
}

/** @param {'rail' | 'list'} col */
export function clampMessengerCol(col, px) {
  const lim = MSGR_COL_LIMITS[col]
  const n = Math.round(Number(px))
  if (!lim || !Number.isFinite(n)) return null
  return Math.min(lim.max, Math.max(lim.min, n))
}

/** Сохранённое в браузере → { rail, list } (каждая — px или null = как по умолчанию). Мусор не ломает экран. */
export function parseMessengerCols(raw) {
  let v = null
  try {
    v = typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    v = null
  }
  const pick = (col) => (v && v[col] != null ? clampMessengerCol(col, v[col]) : null)
  return { rail: pick('rail'), list: pick('list') }
}

/**
 * Переменные сетки для монитора. Доля экрана сверху — на маленьком мониторе подвинутая колонка не задавит диалог.
 * @param {{ rail: number | null, list: number | null }} cols
 */
export function messengerColsStyle(cols) {
  const style = {}
  if (cols.rail != null) style['--msgr-rail'] = `min(${cols.rail}px, 25%)`
  if (cols.list != null) style['--msgr-list'] = `min(${cols.list}px, 40%)`
  return style
}
