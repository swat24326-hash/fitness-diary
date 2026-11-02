/**
 * Высота кадра формы записи: на весь видимый экран.
 * После закрытия клавиатуры iPhone иногда оставляет короткий visualViewport при offsetTop≈0 —
 * тогда берём layout, иначе окно «сжимается» и не расправляется (жалоба 03.11).
 * @param {{ viewportHeight: unknown, layoutHeight: unknown, offsetTop?: unknown }} p
 * @returns {number | null}
 */
export function scheduleModalFrameHeightPx({ viewportHeight, layoutHeight, offsetTop = 0 }) {
  const vv = Number(viewportHeight)
  const layout = Number(layoutHeight)
  const pan = Number(offsetTop) || 0
  if (pan > 0.5 && Number.isFinite(vv) && vv > 0) return Math.round(vv)
  if (Number.isFinite(layout) && layout > 0) {
    if (!Number.isFinite(vv) || vv <= 0) return Math.round(layout)
    /* Клавиатура без pan: vv заметно короче layout. Иначе — полный экран (не залипать коротким vv). */
    if (vv < layout - 80) return Math.round(vv)
    return Math.round(layout)
  }
  return Number.isFinite(vv) && vv > 0 ? Math.round(vv) : null
}

/** @deprecated имя для старых вызовов — то же, что frame без layout. */
export function scheduleModalPanelMaxHeightPx({ viewportHeight, margin = 0, min = 220 }) {
  const h = Number(viewportHeight)
  if (!Number.isFinite(h) || h <= 0) return null
  return Math.max(min, Math.floor(h - (Number(margin) || 0)))
}

/**
 * Overlay ровно на visible viewport (iOS клавиатура).
 * @param {{ offsetTop: unknown, height: unknown }} p
 * @returns {{ top: string, height: string, bottom: string, left?: string, right?: string, width?: string } | Record<string, never>}
 */
export function scheduleModalOverlayInsetStyle({ offsetTop, height }) {
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
