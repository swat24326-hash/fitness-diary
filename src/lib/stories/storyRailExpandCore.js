/**
 * Компактный ряд сторис на телефоне: потянуть вниз → раскрыть (как в Telegram).
 * Чистые пороги без DOM. Скролл страницы важнее жеста, кроме компакта у верха.
 */
import { MSGR_PHONE_MAX } from '../chat/messengerColumnsCore.js'

/** На сколько px тянуть вниз до полного раскрытия. */
export const STORY_RAIL_PULL_PX = 72
/** Progress ≥ этого — snap «раскрыто», иначе «компакт». */
export const STORY_RAIL_SNAP = 0.45
/** Ниже — удержание/шум, не жест. */
export const STORY_RAIL_DEAD_PX = 10
/**
 * Порог «это тяга вниз». Раньше 22px — страница успевала уехать, жест рвался.
 * Чуть выше dead, чтобы не путать с тапом.
 */
export const STORY_RAIL_LOCK_PX = 12
/** Скролл ниже — снова компакт. */
export const STORY_RAIL_COLLAPSE_SCROLL_PX = 24

/**
 * Телефонная поверхность для жеста.
 * msgr--phone → да; tablet/monitor → нет; без msgr (клиент/coach) → по ширине ≤ MSGR_PHONE_MAX.
 * @param {{ width: number, msgrMode?: 'phone' | 'tablet' | 'monitor' | null }} p
 */
export function storyRailExpandIsPhone({ width, msgrMode = null }) {
  if (msgrMode === 'phone') return true
  if (msgrMode === 'tablet' || msgrMode === 'monitor') return false
  return Number(width) <= MSGR_PHONE_MAX
}

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
export function clamp01(n, lo = 0, hi = 1) {
  const x = Number(n)
  if (!Number.isFinite(x)) return lo
  return Math.min(hi, Math.max(lo, x))
}

/**
 * Ось жеста: pull только после явного ухода вниз (LOCK).
 * Вверх — скролл страницы. Вбок — авторы.
 * @param {{ dx: number, dy: number, lockPx?: number }} move
 * @returns {'pull' | 'pan-x' | 'scroll' | 'none'}
 */
export function storyRailExpandAxis({ dx, dy, lockPx = STORY_RAIL_LOCK_PX }) {
  const ax = Math.abs(Number(dx) || 0)
  const ay = Math.abs(Number(dy) || 0)
  const lock = Math.max(STORY_RAIL_DEAD_PX, Number(lockPx) || STORY_RAIL_LOCK_PX)
  if (ax < STORY_RAIL_DEAD_PX && ay < STORY_RAIL_DEAD_PX) return 'none'
  if (ay >= ax) {
    const y = Number(dy) || 0
    if (y >= lock) return 'pull'
    if (y <= -STORY_RAIL_DEAD_PX) return 'scroll'
    return 'none'
  }
  return 'pan-x'
}

/**
 * Progress 0..1 из смещения пальца вниз, от текущего состояния.
 * @param {{ dy: number, from: number, pullPx?: number }} p
 */
export function storyRailExpandProgress({ dy, from, pullPx = STORY_RAIL_PULL_PX }) {
  const base = clamp01(from)
  const dist = Math.max(1, Number(pullPx) || STORY_RAIL_PULL_PX)
  const delta = (Number(dy) || 0) / dist
  return clamp01(base + delta)
}

/**
 * @param {number} progress
 * @param {number} [snap]
 * @returns {0 | 1}
 */
export function storyRailExpandSnap(progress, snap = STORY_RAIL_SNAP) {
  return clamp01(progress) >= snap ? 1 : 0
}

/**
 * Скролл контента вниз схлопывает ряд.
 * @param {{ scrollTop: number, expanded: boolean, threshold?: number }} p
 * @returns {boolean} true — оставить раскрытым
 */
export function storyRailExpandStayOpen({ scrollTop, expanded, threshold = STORY_RAIL_COLLAPSE_SCROLL_PX }) {
  if (!expanded) return false
  return (Number(scrollTop) || 0) < (Number(threshold) || STORY_RAIL_COLLAPSE_SCROLL_PX)
}

/** Можно начать pull только у верха списка. */
export function storyRailExpandAtTop(scrollTop) {
  return (Number(scrollTop) || 0) <= 1
}

/**
 * Тяга имеет смысл только из компакта / середины. Раскрытый ряд — только скролл страницы.
 * @param {number} progress
 */
export function storyRailExpandCanPull(progress) {
  return clamp01(progress) < 1
}

/**
 * preventDefault: зафиксированная тяга или уже явное вниз у верха (пока ось none),
 * иначе iOS/Android успевают начать скролл и touchmove становится не-cancelable.
 * @param {{ axis: string, dy: number, dx?: number, atTop?: boolean, canPull?: boolean }} p
 */
export function storyRailExpandBlockScroll({ axis, dy, dx = 0, atTop = true, canPull = true }) {
  const y = Number(dy) || 0
  if (y <= 0) return false
  if (axis === 'pull') return true
  if (!canPull || !atTop || axis === 'pan-x' || axis === 'scroll') return false
  const ax = Math.abs(Number(dx) || 0)
  return y >= STORY_RAIL_DEAD_PX && y >= ax
}
