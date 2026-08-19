/** Sticky-шапка в visible visual viewport, когда клавиатура планшета панорамирует страницу. */

export const VISUAL_VIEWPORT_PIN_EPS = 0.5
export const FOCUSED_FIELD_GAP_PX = 10
export const FOCUSED_FIELD_MIN_OVERLAP_PX = 12

/**
 * @param {unknown} offsetTop
 * @returns {string} значение CSS top или '' (обычный sticky top: 0)
 */
export function chromeStickyTopForVisualOffset(offsetTop) {
  const y = Number(offsetTop)
  if (!Number.isFinite(y) || y <= VISUAL_VIEWPORT_PIN_EPS) return ''
  return `${y}px`
}

/**
 * Document scrollBy.top: отрицательный — поле уезжает ниже шапки (ниже на экране).
 * @param {{ fieldTop: unknown, visibleTop: unknown, chromeHeight: unknown, gap?: number }} p
 */
export function overlapScrollByTop({ fieldTop, visibleTop, chromeHeight, gap = FOCUSED_FIELD_GAP_PX }) {
  const yField = Number(fieldTop)
  const yVis = Number(visibleTop)
  const h = Number(chromeHeight)
  const g = Number(gap)
  if (![yField, yVis, h].every(Number.isFinite) || h <= 0) return 0
  const chromeBottom = yVis + h
  if (yField >= chromeBottom) return 0
  const overlap = chromeBottom + (Number.isFinite(g) ? g : FOCUSED_FIELD_GAP_PX) - yField
  if (overlap < FOCUSED_FIELD_MIN_OVERLAP_PX) return 0
  return -overlap
}

function isFocusableField(node) {
  if (!node || node.nodeType !== 1) return false
  const tag = String(node.tagName || '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag !== 'input') return false
  const type = String(node.type || 'text').toLowerCase()
  return type !== 'hidden' && type !== 'button' && type !== 'submit' && type !== 'checkbox' && type !== 'radio'
}

/**
 * @param {HTMLElement | null} el
 * @returns {() => void}
 */
export function attachVisualViewportChromePin(el) {
  if (!el || typeof window === 'undefined') return () => {}
  const vv = window.visualViewport
  if (!vv) return () => {}

  let raf = 0
  let revealing = false
  const root = document.documentElement

  const clearInline = () => {
    el.style.top = ''
    el.style.transform = ''
    el.classList.remove('app-chrome-top--vv-pinned')
    root.style.scrollPaddingTop = ''
  }

  const revealFocusedField = (pinned) => {
    if (!pinned || revealing) return
    const field = document.activeElement
    if (!isFocusableField(field)) return
    const chromeRect = el.getBoundingClientRect()
    const rect = field.getBoundingClientRect()
    const dy = overlapScrollByTop({
      fieldTop: rect.top,
      visibleTop: chromeRect.top,
      chromeHeight: chromeRect.height,
    })
    if (!dy) return
    revealing = true
    window.scrollBy(0, dy)
    window.requestAnimationFrame(() => {
      revealing = false
    })
  }

  const sync = (opts = {}) => {
    const { revealFocus = false } = opts
    const top = chromeStickyTopForVisualOffset(vv.offsetTop)
    const pinned = Boolean(top)
    if (el.style.top !== top) el.style.top = top
    if (el.style.transform) el.style.transform = ''
    el.classList.toggle('app-chrome-top--vv-pinned', pinned)
    const pad = pinned ? `${Math.ceil(el.getBoundingClientRect().height)}px` : ''
    if (root.style.scrollPaddingTop !== pad) root.style.scrollPaddingTop = pad
    if (revealFocus) revealFocusedField(pinned)
  }

  const schedule = (opts = {}) => {
    const { revealFocus = false } = opts
    if (raf) return
    raf = window.requestAnimationFrame(() => {
      raf = 0
      sync({ revealFocus })
    })
  }

  const onViewportScroll = () => schedule()
  const onViewportResize = () => schedule({ revealFocus: true })
  const onWindowScroll = () => schedule()
  const onFocusIn = () => schedule({ revealFocus: true })

  vv.addEventListener('scroll', onViewportScroll, { passive: true })
  vv.addEventListener('resize', onViewportResize, { passive: true })
  window.addEventListener('scroll', onWindowScroll, { passive: true })
  window.addEventListener('focusin', onFocusIn)
  sync({ revealFocus: true })
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    vv.removeEventListener('scroll', onViewportScroll)
    vv.removeEventListener('resize', onViewportResize)
    window.removeEventListener('scroll', onWindowScroll)
    window.removeEventListener('focusin', onFocusIn)
    clearInline()
  }
}
