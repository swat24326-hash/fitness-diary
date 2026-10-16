/** Число дней рациона (фаза 4): 3–7. */

/** @param {unknown} n */
export function clampDayCount(n) {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x)) return 7
  return Math.min(7, Math.max(3, x))
}

export const NUTRITION_DAYS_COUNT_OPTIONS = [
  { id: 1, label: '1 день' },
  { id: 3, label: '3 дня' },
  { id: 5, label: '5 дней' },
  { id: 7, label: 'Неделя' },
]
