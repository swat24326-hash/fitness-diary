/**
 * Кадр формы записи на телефоне.
 * Оверлей на весь layout (календарь не просвечивает). Pin к visualViewport —
 * только пока реально клавиатура (поле в фокусе или pan), иначе залипший короткий vv
 * оставляет щель снизу и кнопки под статус-баром (INC-2026-11-03-05).
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
 * При pin — ровно visible viewport. Без pin — явный fullscreen (сбросить inline height после клавиатуры).
 * @param {{ offsetTop: unknown, height: unknown, pin?: boolean }} p
 * @returns {{ top: string, height: string, bottom: string, left?: string, right?: string, width?: string } | Record<string, never>}
 */
export function scheduleModalOverlayInsetStyle({ offsetTop, height, pin = true }) {
  if (!pin) {
    return {
      top: '0px',
      left: '0',
      right: '0',
      bottom: '0',
      width: '100%',
      height: '100%',
    }
  }
  const top = Number(offsetTop)
  const h = Number(height)
  if (![top, h].every(Number.isFinite) || h <= 0) return {}
  return {
    top: `${Math.round(Math.max(0, top))}px`,
    height: `${Math.round(h)}px`,
    bottom: 'auto',
    left: '0',
    right: '0',
    width: '100%',
  }
}
