/**
 * Клавиатура vs залипший короткий visualViewport (iPhone).
 * Короткий vv без фокуса/pan — не считать клавиатурой (иначе вкладки /coach
 * уезжают вверх, оболочка «в половине экрана», INC-2026-11-03-05).
 */

export const VISUAL_VIEWPORT_KEYBOARD_SHORTEN_PX = 80

/**
 * @param {unknown} el
 * @returns {boolean}
 */
export function visualViewportTextFieldFocused(el) {
  if (!el || typeof el !== 'object') return false
  const tag = String(/** @type {{ tagName?: string }} */ (el).tagName || '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag !== 'input') return false
  const type = String(/** @type {{ type?: string }} */ (el).type || 'text').toLowerCase()
  return !['button', 'checkbox', 'radio', 'file', 'submit', 'reset', 'image', 'hidden', 'range', 'color'].includes(
    type,
  )
}

/**
 * @param {{ viewportHeight: unknown, layoutHeight: unknown, offsetTop?: unknown, inputFocused?: unknown }} p
 * @returns {boolean}
 */
export function visualViewportKeyboardOpen({
  viewportHeight,
  layoutHeight,
  offsetTop = 0,
  inputFocused = false,
}) {
  const vv = Number(viewportHeight)
  const layout = Number(layoutHeight)
  if (!Number.isFinite(layout) || layout <= 0) return false
  if (!Number.isFinite(vv) || vv <= 0) return false
  if (vv >= layout - VISUAL_VIEWPORT_KEYBOARD_SHORTEN_PX) return false
  const pan = Number(offsetTop) || 0
  return Boolean(inputFocused) || pan > 0.5
}
