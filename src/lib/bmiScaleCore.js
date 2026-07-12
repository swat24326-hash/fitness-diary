/** Нижняя граница шкалы ИМТ на UI (чуть ниже дефицита). */
export const BMI_SCALE_MIN = 14

/** Верхняя граница шкалы ИМТ на UI. */
export const BMI_SCALE_MAX = 40

/** Деления под шкалой. */
export const BMI_SCALE_TICKS = [18.5, 25, 30, 40]

/**
 * Колонки сегментов на шкале 14–40: дефицит / норма / избыток / ожирение.
 * @type {readonly [number, number, number, number]}
 */
export const BMI_BAR_SEGMENT_WIDTHS = [4.5, 6.5, 5, 10]

export const BMI_BAR_GRID_COLUMNS = BMI_BAR_SEGMENT_WIDTHS.map((w) => `${w}fr`).join(' ')

export const BMI_ZONE_COLORS = /** @type {const} */ ({
  under: '#38bdf8',
  normal: '#22c55e',
  over: '#f97316',
  obese: '#ef4444',
})

/**
 * @param {unknown} heightCm
 * @param {unknown} weightKg
 * @returns {number | null}
 */
export function calcBmiFromHeightWeight(heightCm, weightKg) {
  const h = Number(String(heightCm ?? '').replace(',', '.'))
  const w = Number(String(weightKg ?? '').replace(',', '.'))
  if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null
  const m = h / 100
  const v = w / (m * m)
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

/**
 * @param {number | null | undefined} bmi
 */
export function getBmiMeta(bmi) {
  if (bmi == null || !Number.isFinite(bmi)) return null
  if (bmi < 18.5) return { key: 'under', label: 'Дефицит', color: BMI_ZONE_COLORS.under }
  if (bmi < 25) return { key: 'normal', label: 'Норма', color: BMI_ZONE_COLORS.normal }
  if (bmi < 30) return { key: 'over', label: 'Избыток', color: BMI_ZONE_COLORS.over }
  return { key: 'obese', label: 'Ожирение', color: BMI_ZONE_COLORS.obese }
}

/**
 * Позиция маркера / деления на шкале 14–40 (%).
 * @param {number} bmiOrTick
 */
export function bmiToBarPercent(bmiOrTick) {
  const clamped = Math.min(BMI_SCALE_MAX, Math.max(BMI_SCALE_MIN, bmiOrTick))
  return ((clamped - BMI_SCALE_MIN) / (BMI_SCALE_MAX - BMI_SCALE_MIN)) * 100
}
