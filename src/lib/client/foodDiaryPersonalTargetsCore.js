/**
 * Свои цели КБЖУ клиента (АЗ/ТЗ; у ПЗ — запас, если рациона нет).
 */
import { FOOD_DIARY_DEFAULT_TARGETS } from './foodDiarySummaryCore.js'

const KCAL_MIN = 800
const KCAL_MAX = 5000
const MACRO_MIN = 10
const MACRO_MAX = 400

function positiveInt(v, min, max) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

/**
 * @param {object|null|undefined} row
 * @returns {Partial<typeof FOOD_DIARY_DEFAULT_TARGETS> | null}
 */
export function publicFoodDiaryPersonalTargets(row) {
  if (!row || typeof row !== 'object') return null
  const kcal = positiveInt(row.kcal, KCAL_MIN, KCAL_MAX)
  if (!kcal) return null
  const protein_g = positiveInt(row.protein_g, MACRO_MIN, MACRO_MAX)
  const fat_g = positiveInt(row.fat_g, MACRO_MIN, MACRO_MAX)
  const carbs_g = positiveInt(row.carbs_g, MACRO_MIN, MACRO_MAX)
  /** @type {Partial<typeof FOOD_DIARY_DEFAULT_TARGETS>} */
  const out = { kcal }
  if (protein_g) out.protein_g = protein_g
  if (fat_g) out.fat_g = fat_g
  if (carbs_g) out.carbs_g = carbs_g
  return out
}

/**
 * @param {object} body
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function parseFoodDiaryPersonalTargets(body) {
  const kcal = positiveInt(body?.kcal, KCAL_MIN, KCAL_MAX)
  if (!kcal) {
    return { ok: false, error: `Ккал: от ${KCAL_MIN} до ${KCAL_MAX}` }
  }
  const protein_g = positiveInt(body?.protein_g, MACRO_MIN, MACRO_MAX)
  const fat_g = positiveInt(body?.fat_g, MACRO_MIN, MACRO_MAX)
  const carbs_g = positiveInt(body?.carbs_g, MACRO_MIN, MACRO_MAX)
  if (!protein_g) return { ok: false, error: `Белки: от ${MACRO_MIN} до ${MACRO_MAX} г` }
  if (!fat_g) return { ok: false, error: `Жиры: от ${MACRO_MIN} до ${MACRO_MAX} г` }
  if (!carbs_g) return { ok: false, error: `Углеводы: от ${MACRO_MIN} до ${MACRO_MAX} г` }
  return {
    ok: true,
    value: { kcal, protein_g, fat_g, carbs_g },
  }
}

/** Черновик формы: свои или дефолты. */
export function foodDiaryPersonalTargetsFormSeed(personal) {
  const base = { ...FOOD_DIARY_DEFAULT_TARGETS, ...(personal || {}) }
  return {
    kcal: Math.round(Number(base.kcal) || FOOD_DIARY_DEFAULT_TARGETS.kcal),
    protein_g: Math.round(Number(base.protein_g) || FOOD_DIARY_DEFAULT_TARGETS.protein_g),
    fat_g: Math.round(Number(base.fat_g) || FOOD_DIARY_DEFAULT_TARGETS.fat_g),
    carbs_g: Math.round(Number(base.carbs_g) || FOOD_DIARY_DEFAULT_TARGETS.carbs_g),
  }
}
