/**
 * iPhone /coach: shell не уползает после клавиатуры / жеста (Android ок).
 * Публичный вход: `src/lib/coach/coachVisualViewport.js` → `attachCoachVisualViewport`.
 *
 * Горизонт: `translateX(offsetLeft)` на fullscreen запрещён (режет края).
 * Pinch → vv.scale/offsetLeft («ездит»); полный блок pinch без отзума → статичный «закус».
 * html/body: manipulation (не pan-y) — иначе пересечение с pan-x папок даёт none.
 */

import { isAppleTouchDevice } from '../client/sparkShakeCore.js'
import { visualViewportKeyboardOpen, visualViewportTextFieldFocused } from '../visualViewportKeyboard.js'

/**
 * Горизонталь (left/right) — всегда. width не задаём: left+right+width=100% на 17 Pro
 * перетягивает и «закусывает» край. Вертикаль отпускаем только при печати.
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
    width: '',
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
    /* height не задавать с top+bottom — на 17 Pro оболочка короче экрана, вкладки «задраны». */
    height: '',
    transform: 'none',
  }
}

/**
 * Pinch / Safari gesture → visualViewport.scale + offsetLeft.
 * Если уже увеличено — не блокируем (иначе нельзя отзумить → статичный закус).
 * @param {{ touchesLength?: unknown, scale?: unknown }} p
 * @returns {boolean}
 */
export function coachShellShouldBlockPinchTouch({ touchesLength, scale = 1 } = {}) {
  const n = Number(touchesLength)
  if (!Number.isFinite(n) || n <= 1) return false
  const s = Number(scale)
  if (Number.isFinite(s) && s > 1.01) return false
  return true
}

/**
 * Нужен сброс масштаба (залипший pinch). Только scale — offsetLeft один не трогаем
 * (pulse meta из‑за offsetLeft ломал высоту, вкладки «задраны»).
 * @param {{ scale?: unknown }} p
 * @returns {boolean}
 */
export function coachShellViewportScaleStuck({ scale = 1 } = {}) {
  const s = Number(scale)
  return Number.isFinite(s) && Math.abs(s - 1) > 0.01
}

/**
 * Короткий pulse maximum-scale=1 — сбрасывает залипший zoom Safari (без translateX).
 * @param {HTMLMetaElement | null | undefined} meta
 * @returns {boolean} true если pulse сделан
 */
export function coachShellPulseViewportMeta(meta) {
  if (!meta || typeof meta.getAttribute !== 'function') return false
  const content = meta.getAttribute('content')
  if (!content || /maximum-scale\s*=/i.test(content)) return false
  meta.setAttribute('content', `${content}, maximum-scale=1`)
  meta.setAttribute('content', content)
  return true
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
  let lastPulseAt = 0

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
    const offsetLeft = vv?.offsetLeft ?? 0
    const scale = vv?.scale ?? 1
    const viewportHeight = vv?.height ?? layoutHeight
    const inputFocused = visualViewportTextFieldFocused(document.activeElement)
    const keyboard = visualViewportKeyboardOpen({
      viewportHeight,
      layoutHeight,
      offsetTop,
      inputFocused,
    })
    const typing = Boolean(keyboard && inputFocused)
    if (window.scrollX > 0.5 || window.scrollX < -0.5) {
      window.scrollTo(0, window.scrollY)
    }
    if (!typing && (offsetTop > 0.5 || window.scrollY > 0.5 || Math.abs(offsetLeft) > 0.5)) {
      window.scrollTo(0, 0)
    }
    /* Залипший zoom: pulse meta не чаще раза в 800 мс (иначе мерцание). */
    if (!typing && coachShellViewportScaleStuck({ scale }) && Date.now() - lastPulseAt > 800) {
      const meta = document.querySelector('meta[name="viewport"]')
      if (coachShellPulseViewportMeta(/** @type {HTMLMetaElement | null} */ (meta))) {
        lastPulseAt = Date.now()
      }
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
    if (
      coachShellShouldBlockPinchTouch({
        touchesLength: e.touches?.length,
        scale: vv?.scale ?? 1,
      })
    ) {
      e.preventDefault()
      schedule()
    }
  }

  /** @param {Event} e */
  const onGestureStart = (e) => {
    if ((vv?.scale ?? 1) > 1.01) return
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
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  /* Только gesturestart: gesturechange mid-flight + preventDefault залипает scale. */
  document.addEventListener('gesturestart', onGestureStart, { passive: false, capture: true })
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
    document.removeEventListener('gesturestart', onGestureStart, true)
    clearInline()
  }
}
