/** Визуализация прогресса плана продаж для анимированного графика. */

export const PLAN_PROGRESS_MARKER_STEP = 12.5

/**
 * @param {number} progressPercent — может быть > 100
 * @returns {{
 *   fillPercent: number,
 *   overflow: boolean,
 *   overflowPercent: number,
 *   markers: Array<{ id: string, x: number, delayMs: number }>
 * }}
 */
export function buildPlanProgressVisual(progressPercent) {
  const pct = Number(progressPercent) || 0
  const fillPercent = Math.min(100, Math.max(0, pct))
  const overflow = pct > 100
  const overflowPercent = overflow ? Math.round((pct - 100) * 10) / 10 : 0
  const markerCount = fillPercent <= 0
    ? 0
    : Math.min(8, Math.max(1, Math.ceil(fillPercent / PLAN_PROGRESS_MARKER_STEP)))
  const markers = Array.from({ length: markerCount }, (_, i) => ({
    id: `m-${i}`,
    x: ((i + 1) / (markerCount + 1)) * 100,
    delayMs: i * 90,
  }))

  return { fillPercent, overflow, overflowPercent, markers }
}
