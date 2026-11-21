/**
 * Сводка дня как в FatSecret Premium: КБЖУ, доли калорий, клетчатка, сахар, натрий/соль.
 * Цели — дефолты (персональные цели — позже).
 */

/** Дефолтные суточные ориентиры (не медсовет; для прогресс-баров). */
export const FOOD_DIARY_DEFAULT_TARGETS = Object.freeze({
  kcal: 2000,
  protein_g: 75,
  fat_g: 70,
  carbs_g: 250,
  fiber_g: 25,
  sugar_g: 50,
  sodium_mg: 2300,
})

const KCAL_PER_G = Object.freeze({ protein_g: 4, fat_g: 9, carbs_g: 4 })

function round1(n) {
  return Math.round(Number(n) * 10) / 10
}

function clampPct(n) {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(100, Math.round(n))
}

/** Натрий мг → оценка соли г (×2.5). */
export function sodiumMgToSaltG(sodiumMg) {
  return round1((Number(sodiumMg) || 0) * 2.5 / 1000)
}

/**
 * Доля калорий макроса от суммы макро-калорий дня (не от цели).
 * @param {number} grams
 * @param {'protein_g'|'fat_g'|'carbs_g'} key
 * @param {{ protein_g: number, fat_g: number, carbs_g: number }} totals
 */
export function macroKcalSharePct(grams, key, totals) {
  const fromMacros =
    (Number(totals.protein_g) || 0) * KCAL_PER_G.protein_g +
    (Number(totals.fat_g) || 0) * KCAL_PER_G.fat_g +
    (Number(totals.carbs_g) || 0) * KCAL_PER_G.carbs_g
  if (fromMacros <= 0) return 0
  const part = (Number(grams) || 0) * KCAL_PER_G[key]
  return clampPct((part / fromMacros) * 100)
}

/**
 * Прогресс к цели 0…100+ (для бара обрезаем до 100 в UI).
 * @param {number} value
 * @param {number} target
 */
export function nutrientProgressPct(value, target) {
  const t = Number(target)
  if (!Number.isFinite(t) || t <= 0) return 0
  return clampPct(((Number(value) || 0) / t) * 100)
}

/**
 * Строки сводки для экрана.
 * @param {object} totals из sumFoodDiaryDay
 * @param {Partial<typeof FOOD_DIARY_DEFAULT_TARGETS>} [targets]
 */
export function buildFoodDiarySummary(totals, targets = FOOD_DIARY_DEFAULT_TARGETS) {
  const t = { ...FOOD_DIARY_DEFAULT_TARGETS, ...targets }
  const protein_g = Number(totals?.protein_g) || 0
  const fat_g = Number(totals?.fat_g) || 0
  const carbs_g = Number(totals?.carbs_g) || 0
  const kcal = Number(totals?.kcal) || 0
  const fiber_g = Number(totals?.fiber_g) || 0
  const sugar_g = Number(totals?.sugar_g) || 0
  const sodium_mg = Number(totals?.sodium_mg) || 0
  const macros = { protein_g, fat_g, carbs_g }

  return {
    kcal: {
      value: round1(kcal),
      target: t.kcal,
      pct: nutrientProgressPct(kcal, t.kcal),
    },
    macros: [
      {
        key: 'protein_g',
        short: 'Б',
        label: 'Белки',
        value: round1(protein_g),
        unit: 'г',
        target: t.protein_g,
        pct: nutrientProgressPct(protein_g, t.protein_g),
        sharePct: macroKcalSharePct(protein_g, 'protein_g', macros),
      },
      {
        key: 'fat_g',
        short: 'Ж',
        label: 'Жиры',
        value: round1(fat_g),
        unit: 'г',
        target: t.fat_g,
        pct: nutrientProgressPct(fat_g, t.fat_g),
        sharePct: macroKcalSharePct(fat_g, 'fat_g', macros),
      },
      {
        key: 'carbs_g',
        short: 'У',
        label: 'Углеводы',
        value: round1(carbs_g),
        unit: 'г',
        target: t.carbs_g,
        pct: nutrientProgressPct(carbs_g, t.carbs_g),
        sharePct: macroKcalSharePct(carbs_g, 'carbs_g', macros),
      },
    ],
    extras: [
      {
        key: 'fiber_g',
        label: 'Клетчатка',
        value: round1(fiber_g),
        unit: 'г',
        target: t.fiber_g,
        pct: nutrientProgressPct(fiber_g, t.fiber_g),
      },
      {
        key: 'sugar_g',
        label: 'Сахар',
        value: round1(sugar_g),
        unit: 'г',
        target: t.sugar_g,
        pct: nutrientProgressPct(sugar_g, t.sugar_g),
      },
      {
        key: 'sodium_mg',
        label: 'Натрий',
        value: Math.round(sodium_mg),
        unit: 'мг',
        target: t.sodium_mg,
        pct: nutrientProgressPct(sodium_mg, t.sodium_mg),
        hint: `соль ≈ ${formatNutrientValueRu(sodiumMgToSaltG(sodium_mg))} г`,
      },
    ],
  }
}

/** Компактная подпись для pill: «12» или «12,5». */
export function formatNutrientValueRu(n, { integer = false } = {}) {
  const v = Number(n) || 0
  if (integer) return String(Math.round(v))
  const r = round1(v)
  return String(r).replace('.', ',')
}
