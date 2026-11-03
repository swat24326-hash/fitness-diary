/**
 * Кадр формы записи на телефоне.
 * Публичный вход для /coach: `src/lib/coach/coachVisualViewport.js`.
 * Оверлей всегда fullscreen; при клавиатуре ужимаем панель (не top оверлея).
 */

import {
  visualViewportKeyboardOpen,
  visualViewportTextFieldFocused,
} from '../visualViewportKeyboard.js'

export { visualViewportTextFieldFocused as scheduleModalFieldFocused }

/**
 * @param {{ viewportHeight: unknown, layoutHeight: unknown, offsetTop?: unknown, inputFocused?: unknown }} p
 * @returns {boolean}
 */
export function scheduleModalShouldPinVisualViewport(p) {
  return visualViewportKeyboardOpen(p)
}

/**
 * @param {{ viewportHeight: unknown, layoutHeight: unknown, offsetTop?: unknown, inputFocused?: unknown }} p
 * @returns {number | null}
 */
export function scheduleModalFrameHeightPx({
  viewportHeight,
  layoutHeight,
  offsetTop = 0,
  inputFocused = false,
}) {
  const vv = Number(viewportHeight)
  const layout = Number(layoutHeight)
  if (visualViewportKeyboardOpen({ viewportHeight: vv, layoutHeight: layout, offsetTop, inputFocused })) {
    return Math.round(vv)
  }
  if (Number.isFinite(layout) && layout > 0) return Math.round(layout)
  return Number.isFinite(vv) && vv > 0 ? Math.round(vv) : null
}

/** @deprecated имя для старых вызовов — то же, что frame без layout. */
export function scheduleModalPanelMaxHeightPx({ viewportHeight, margin = 0, min = 220 }) {
  const h = Number(viewportHeight)
  if (!Number.isFinite(h) || h <= 0) return null
  return Math.max(min, Math.floor(h - (Number(margin) || 0)))
}

/**
 * Оверлей на весь layout. Без translateX(offsetLeft): сдвиг на 100% ширины
 * уезжает вбок и режет галочки (INC-2026-11-03-05). Горизонт — overflow + сброс scroll/zoom.
 * @param {{ offsetLeft?: unknown }} [p]
 * @returns {{ top: string, left: string, right: string, bottom: string, width: string, height: string, transform: string }}
 */
export function scheduleModalOverlayInsetStyle(_p = {}) {
  return {
    top: '0px',
    left: '0',
    right: '0',
    bottom: '0',
    width: '100%',
    height: '100%',
    transform: 'none',
  }
}

/**
 * Панель: при клавиатуре — высота vv и сдвиг на offsetTop внутри fullscreen-оверлея.
 * @param {{ offsetTop: unknown, height: unknown, pin?: boolean }} p
 * @returns {{ height: string, maxHeight: string, width: string, marginTop: string }}
 */
export function scheduleModalPanelFrameStyle({ offsetTop, height, pin = false }) {
  const base = { height: '100%', maxHeight: '100%', width: '100%', marginTop: '0px' }
  if (!pin) return base
  const top = Number(offsetTop)
  const h = Number(height)
  if (![top, h].every(Number.isFinite) || h <= 0) return base
  return {
    height: `${Math.round(h)}px`,
    maxHeight: `${Math.round(h)}px`,
    width: '100%',
    marginTop: `${Math.round(Math.max(0, top))}px`,
  }
}
