/**
 * Нижняя панель (вкладки /coach) к видимому низу экрана на iPhone.
 * Публичный вход для /coach: `src/lib/coach/coachVisualViewport.js`.
 *
 * Покой: вообще без inline top/bottom/transform — только CSS.
 *   Любой idle JS (top-pin, translateY) на 17 Pro давал «задрана» + чёрную полосу.
 * Клавиатура + фокус: bottom = gapUp.
 */

import { VISUAL_VIEWPORT_KEYBOARD_SHORTEN_PX, visualViewportTextFieldFocused } from './visualViewportKeyboard.js'

export const VISUAL_VIEWPORT_BOTTOM_EPS = 0.5

/**
 * На сколько поднять панель над низом layout viewport (клавиатура).
 * @param {{ innerHeight: unknown, offsetTop: unknown, height: unknown }} p
 * @returns {number} px ≥ 0
 */
export function visualViewportBottomGapPx({ innerHeight, offsetTop, height }) {
  const layout = Number(innerHeight)
  const top = Number(offsetTop)
  const h = Number(height)
  if (![layout, top, h].every(Number.isFinite) || layout <= 0 || h <= 0) return 0
  const gap = layout - top - h
  return gap > VISUAL_VIEWPORT_BOTTOM_EPS ? gap : 0
}

/**
 * Зазор под панелью внутри layout viewport (verify / диагностика).
 * @param {{ tabsBottom: unknown, layoutHeight: unknown }} p
 * @returns {number} px ≥ 0
 */
export function tabsShiftDownToLayoutBottomPx({ tabsBottom, layoutHeight }) {
  const bottom = Number(tabsBottom)
  const layout = Number(layoutHeight)
  if (![bottom, layout].every(Number.isFinite) || layout <= 0) return 0
  const gap = layout - bottom
  return gap > VISUAL_VIEWPORT_BOTTOM_EPS ? gap : 0
}

/**
 * Поднимать вкладки только когда в поле фокус и vv укорочен.
 * @param {{ viewportHeight: unknown, layoutHeight: unknown, inputFocused?: unknown }} p
 * @returns {boolean}
 */
export function visualViewportTabsShouldLift({ viewportHeight, layoutHeight, inputFocused = false }) {
  if (!inputFocused) return false
  const vv = Number(viewportHeight)
  const layout = Number(layoutHeight)
  if (!Number.isFinite(layout) || layout <= 0) return false
  if (!Number.isFinite(vv) || vv <= 0) return false
  return vv < layout - VISUAL_VIEWPORT_KEYBOARD_SHORTEN_PX
}

/**
 * @param {{ offsetTop?: unknown, viewportHeight?: unknown, layoutHeight: unknown, inputFocused?: unknown }} p
 * @returns {number}
 */
export function tabsPinTargetBottomPx({
  offsetTop = 0,
  viewportHeight,
  layoutHeight,
  inputFocused = false,
}) {
  const layout = Number(layoutHeight)
  if (!Number.isFinite(layout) || layout <= 0) return 0
  const ot = Number(offsetTop) || 0
  const vh = Number(viewportHeight)
  if (visualViewportTabsShouldLift({ viewportHeight: vh, layoutHeight: layout, inputFocused })) {
    return ot + vh
  }
  return layout
}

/**
 * @param {{ targetBottom: unknown, tabsHeight: unknown }} p
 * @returns {number | null}
 */
export function tabsPinTopPx({ targetBottom, tabsHeight }) {
  const tb = Number(targetBottom)
  const th = Number(tabsHeight)
  if (![tb, th].every(Number.isFinite) || th <= 0) return null
  return Math.round(tb - th)
}

/**
 * @param {HTMLElement | null} el
 * @returns {() => void}
 */
export function attachVisualViewportBottomPin(el) {
  if (!el || typeof window === 'undefined') return () => {}
  const vv = window.visualViewport

  let raf = 0
  const clearInline = () => {
    el.style.top = ''
    el.style.bottom = ''
    el.style.transform = ''
  }

  const sync = () => {
    raf = 0
    clearInline()
    const layoutH = Math.max(
      window.innerHeight || 0,
      document.documentElement?.clientHeight || 0,
      vv ? Math.round((vv.offsetTop || 0) + (vv.height || 0)) : 0,
    )
    const offsetTop = vv?.offsetTop ?? 0
    const viewportHeight = vv?.height ?? layoutH
    const inputFocused = visualViewportTextFieldFocused(document.activeElement)
    if (!inputFocused && (offsetTop > 0.5 || window.scrollY > 0 || window.scrollX > 0 || (vv && vv.offsetLeft > 0.5))) {
      window.scrollTo(0, 0)
    }

    const lift = visualViewportTabsShouldLift({
      viewportHeight,
      layoutHeight: layoutH,
      inputFocused,
    })
    if (!lift || !vv) return

    const gapUp = visualViewportBottomGapPx({
      innerHeight: layoutH,
      offsetTop,
      height: viewportHeight,
    })
    if (gapUp > 0) el.style.bottom = `${Math.round(gapUp)}px`
  }

  const schedule = () => {
    if (raf) return
    raf = window.requestAnimationFrame(sync)
  }

  if (vv) {
    vv.addEventListener('resize', schedule, { passive: true })
    vv.addEventListener('scroll', schedule, { passive: true })
  }
  window.addEventListener('resize', schedule, { passive: true })
  window.addEventListener('orientationchange', schedule, { passive: true })
  document.addEventListener('focusin', schedule, true)
  document.addEventListener('focusout', schedule, true)
  sync()
  window.requestAnimationFrame(() => window.requestAnimationFrame(sync))
  const t1 = window.setTimeout(schedule, 120)
  const t2 = window.setTimeout(schedule, 400)
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    window.clearTimeout(t1)
    window.clearTimeout(t2)
    if (vv) {
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
    }
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    document.removeEventListener('focusin', schedule, true)
    document.removeEventListener('focusout', schedule, true)
    clearInline()
  }
}
