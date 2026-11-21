/**
 * Вода за день (мл).
 */

export const FOOD_DIARY_WATER_DEFAULT_TARGET_ML = 2000
export const FOOD_DIARY_WATER_STEP_ML = 250
export const FOOD_DIARY_WATER_MAX_ML = 8000

/**
 * @param {unknown} raw
 * @returns {{ ok: true, ml: number } | { ok: false, error: string }}
 */
export function parseFoodDiaryWaterMl(raw) {
  const n = Number(String(raw ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n)) return { ok: false, error: 'Укажите объём воды' }
  const ml = Math.round(n)
  if (ml < 0 || ml > FOOD_DIARY_WATER_MAX_ML) {
    return { ok: false, error: `Вода: от 0 до ${FOOD_DIARY_WATER_MAX_ML} мл` }
  }
  return { ok: true, ml }
}

export function foodDiaryWaterProgressPct(ml, target = FOOD_DIARY_WATER_DEFAULT_TARGET_ML) {
  const t = Number(target)
  if (!Number.isFinite(t) || t <= 0) return 0
  return Math.min(100, Math.round(((Number(ml) || 0) / t) * 100))
}

export function clampWaterAdd(currentMl, delta) {
  const next = (Number(currentMl) || 0) + (Number(delta) || 0)
  return Math.max(0, Math.min(FOOD_DIARY_WATER_MAX_ML, Math.round(next)))
}
