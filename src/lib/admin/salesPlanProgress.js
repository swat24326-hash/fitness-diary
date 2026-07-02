/** Визуализация прогресса плана продаж для анимированной полоски. */

/**
 * @param {number} progressPercent — может быть > 100
 * @returns {{ fillPercent: number, overflow: boolean, overflowPercent: number }}
 */
export function buildPlanProgressVisual(progressPercent) {
  const pct = Number(progressPercent) || 0
  const fillPercent = Math.min(100, Math.max(0, pct))
  const overflow = pct > 100
  const overflowPercent = overflow ? Math.round((pct - 100) * 10) / 10 : 0

  return { fillPercent, overflow, overflowPercent }
}
