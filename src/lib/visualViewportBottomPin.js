/**
 * Нижняя панель (вкладки /coach) к видимому низу экрана на iPhone.
 * WebKit иногда кладёт position:fixed; bottom:0 выше home indicator / панели Safari —
 * под панелью остаётся чёрный зазор, пальцем можно «опустить» (INC-2026-10-17-05/08).
 */

export const VISUAL_VIEWPORT_BOTTOM_EPS = 0.5

/**
 * На сколько поднять панель над низом layout viewport (клавиатура / панель Safari снизу).
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
 * Зазор под панелью внутри layout viewport: bottom:0 не дотянул до innerHeight
 * (WebKit уже «посадил» fixed выше safe-area). Сдвиг вниз на этот зазор.
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
 * @param {HTMLElement | null} el
 * @returns {() => void}
 */
export function attachVisualViewportBottomPin(el) {
  if (!el || typeof window === 'undefined') return () => {}
  const vv = window.visualViewport

  let raf = 0
  const clearInline = () => {
    el.style.bottom = ''
    el.style.transform = ''
  }

  const sync = () => {
    raf = 0
    clearInline()
    const layoutH = window.innerHeight
    const gapUp = vv
      ? visualViewportBottomGapPx({
          innerHeight: layoutH,
          offsetTop: vv.offsetTop,
          height: vv.height,
        })
      : 0
    if (gapUp > 0) {
      el.style.bottom = `${Math.round(gapUp)}px`
      return
    }
    const rect = el.getBoundingClientRect()
    const shift = tabsShiftDownToLayoutBottomPx({ tabsBottom: rect.bottom, layoutHeight: layoutH })
    if (shift > 0) el.style.transform = `translateY(${Math.round(shift)}px)`
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
  sync()
  /* iPhone: в первом кадре safe-area / vv часто ещё 0 — дотянуть после layout. */
  window.requestAnimationFrame(() => window.requestAnimationFrame(sync))
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    if (vv) {
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
    }
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    clearInline()
  }
}
