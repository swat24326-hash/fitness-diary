/**
 * iPhone /coach: shell не уползает после клавиатуры / жеста (Android ок).
 * Публичный вход: `src/lib/coach/coachVisualViewport.js` → `attachCoachVisualViewport`.
 */

import { isAppleTouchDevice } from '../client/sparkShakeCore.js'
import { visualViewportKeyboardOpen, visualViewportTextFieldFocused } from '../visualViewportKeyboard.js'

/**
 * @param {{ offsetTop: unknown, viewportHeight: unknown, layoutHeight: unknown, inputFocused?: unknown }} p
 * @returns {{ top: string, left: string, right: string, bottom: string, height: string, width: string, transform: string }}
 */
export function coachShellLayoutLockStyle({ offsetTop, viewportHeight, layoutHeight, inputFocused = false }) {
  const keyboard = visualViewportKeyboardOpen({
    viewportHeight,
    layoutHeight,
    offsetTop,
    inputFocused,
  })
  if (keyboard) {
    return {
      top: '',
      left: '',
      right: '',
      bottom: '',
      height: '',
      width: '',
      transform: '',
    }
  }
  return {
    top: '0px',
    left: '0px',
    right: '0px',
    bottom: '0px',
    height: '100%',
    width: '100%',
    transform: 'none',
  }
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
    if (!keyboard && (offsetTop > 0.5 || window.scrollY > 0 || (vv && vv.offsetLeft > 0.5))) {
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

  if (vv) {
    vv.addEventListener('resize', schedule, { passive: true })
    vv.addEventListener('scroll', schedule, { passive: true })
  }
  window.addEventListener('resize', schedule, { passive: true })
  window.addEventListener('orientationchange', schedule, { passive: true })
  document.addEventListener('focusin', schedule, true)
  document.addEventListener('focusout', schedule, true)
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
    clearInline()
  }
}
