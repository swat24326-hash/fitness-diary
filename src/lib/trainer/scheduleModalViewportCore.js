/**
 * Высота панели формы записи под visible viewport (клавиатура).
 * @param {{ viewportHeight: unknown, margin?: number, min?: number }} p
 * @returns {number | null}
 */
export function scheduleModalPanelMaxHeightPx({ viewportHeight, margin = 12, min = 220 }) {
  const h = Number(viewportHeight)
  if (!Number.isFinite(h) || h <= 0) return null
  return Math.max(min, Math.floor(h - margin))
}

/**
 * Overlay поверх visible viewport, а не layout (iOS клавиатура).
 * @param {{ offsetTop: unknown, height: unknown }} p
 * @returns {{ top: string, height: string, bottom: string } | Record<string, never>}
 */
export function scheduleModalOverlayInsetStyle({ offsetTop, height }) {
  const top = Number(offsetTop)
  const h = Number(height)
  if (![top, h].every(Number.isFinite) || h <= 0) return {}
  return {
    top: `${Math.round(Math.max(0, top))}px`,
    height: `${Math.round(h)}px`,
    bottom: 'auto',
  }
}
