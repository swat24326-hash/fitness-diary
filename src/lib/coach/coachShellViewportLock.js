/**
 * iPhone /coach: shell не уползает после клавиатуры / жеста (Android ок).
 * Публичный вход: `src/lib/coach/coachVisualViewport.js` → `attachCoachVisualViewport`.
 *
 * Горизонт: `translateX(offsetLeft)` на fullscreen запрещён (режет края).
 * На 17 Pro «ездит влево-вправо» чаще от pinch / gesture → vv.offsetLeft;
 * scrollTo это не снимает — блокируем pinch и держим touch-action: pan-y.
 */

import { isAppleTouchDevice } from '../client/sparkShakeCore.js'
import { visualViewportKeyboardOpen, visualViewportTextFieldFocused } from '../visualViewportKeyboard.js'

/**
 * Горизонталь (left/right/width) — всегда: иначе iPhone чуть ездит влево-вправо.
 * Вертикаль отпускаем только при печати (chatViewportFit ставит translateY).
 * @param {{ offsetTop: unknown, viewportHeight: unknown, layoutHeight: unknown, inputFocused?: unknown }} p
 * @returns {Record<string, string>}
 */
export function coachShellLayoutLockStyle({ offsetTop, viewportHeight, layoutHeight, inputFocused = false }) {
  const keyboard = visualViewportKeyboardOpen({
    viewportHeight,
    layoutHeight,
    offsetTop,
    inputFocused,
  })
  const typing = Boolean(keyboard && inputFocused)
  /** @type {Record<string, string>} */
  const horizontal = {
    left: '0px',
    right: '0px',
    width: '100%',
  }
  if (typing) {
    return {
      ...horizontal,
      top: '',
      bottom: '',
      height: '',
    }
  }
  return {
    ...horizontal,
    top: '0px',
    bottom: '0px',
    height: '100%',
    transform: 'none',
  }
}

/**
 * Pinch / Safari gesture → visualViewport.scale + offsetLeft (экран «плывёт» вбок).
 * @param {{ touchesLength?: unknown }} p
 * @returns {boolean}
 */
export function coachShellShouldBlockPinchTouch({ touchesLength } = {}) {
  const n = Number(touchesLength)
  return Number.isFinite(n) && n > 1
}

/**
 * @param {HTMLElement | null} el
 * @returns {() => void}
 */
export function attachCoachShellViewportLock(el) {
  if (!el || typeof window === 'undefined') return () => {}
  const apple = isAppleTouchDevice({
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0,
  })
  if (!apple) return () => {}

  const vv = window.visualViewport
  let raf = 0

  const clearInline = () => {
    el.style.top = ''
    el.style.left = ''
    el.style.right = ''
    el.style.bottom = ''
    el.style.height = ''
    el.style.width = ''
    el.style.transform = ''
  }

  const apply = (style) => {
    for (const [key, value] of Object.entries(style)) {
      if (value === undefined) continue
      el.style[key] = value
    }
  }

  const sync = () => {
    raf = 0
    const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0)
    const offsetTop = vv?.offsetTop ?? 0
    const viewportHeight = vv?.height ?? layoutHeight
    const inputFocused = visualViewportTextFieldFocused(document.activeElement)
    const keyboard = visualViewportKeyboardOpen({
      viewportHeight,
      layoutHeight,
      offsetTop,
      inputFocused,
    })
    const typing = Boolean(keyboard && inputFocused)
    /* Горизонтальный сдвиг страницы — всегда сбрасывать (микро-«влево-вправо» на iPhone). */
    if (window.scrollX > 0.5 || window.scrollX < -0.5) {
      window.scrollTo(0, window.scrollY)
    }
    if (!typing && (offsetTop > 0.5 || window.scrollY > 0.5 || (vv && Math.abs(vv.offsetLeft) > 0.5))) {
      window.scrollTo(0, 0)
    }
    apply(
      coachShellLayoutLockStyle({
        offsetTop,
        viewportHeight,
        layoutHeight,
        inputFocused,
      }),
    )
  }

  const schedule = () => {
    if (raf) return
    raf = window.requestAnimationFrame(sync)
  }

  /** @param {TouchEvent} e */
  const onTouchMove = (e) => {
    if (coachShellShouldBlockPinchTouch({ touchesLength: e.touches?.length })) {
      e.preventDefault()
      schedule()
    }
  }

  /** @param {Event} e */
  const blockGesture = (e) => {
    e.preventDefault()
    schedule()
  }

  if (vv) {
    vv.addEventListener('resize', schedule, { passive: true })
    vv.addEventListener('scroll', schedule, { passive: true })
  }
  window.addEventListener('resize', schedule, { passive: true })
  window.addEventListener('orientationchange', schedule, { passive: true })
  document.addEventListener('focusin', schedule, true)
  document.addEventListener('focusout', schedule, true)
  /* non-passive: иначе preventDefault на pinch не сработает. */
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  document.addEventListener('gesturestart', blockGesture, { passive: false, capture: true })
  document.addEventListener('gesturechange', blockGesture, { passive: false, capture: true })
  sync()
  window.requestAnimationFrame(() => window.requestAnimationFrame(schedule))
  const t1 = window.setTimeout(schedule, 120)
  const t2 = window.setTimeout(schedule, 320)
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
    document.removeEventListener('touchmove', onTouchMove, true)
    document.removeEventListener('gesturestart', blockGesture, true)
    document.removeEventListener('gesturechange', blockGesture, true)
    clearInline()
  }
}
