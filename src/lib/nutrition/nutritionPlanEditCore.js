import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import { formatProductPortion, macrosForGrams, roundGrams } from './nutritionMacrosCore.js'
import { clampProductGrams } from './nutritionMealPairingCore.js'

function sumItems(items) {
  return items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + (it.kcal ?? 0),
      proteinG: Math.round((acc.proteinG + (it.proteinG ?? 0)) * 10) / 10,
      fatG: Math.round((acc.fatG + (it.fatG ?? 0)) * 10) / 10,
      carbsG: Math.round((acc.carbsG + (it.carbsG ?? 0)) * 10) / 10,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  )
}

/**
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @param {string} productId
 * @param {number} grams
 */
export function recalcItemFromGrams(catalogMap, productId, grams) {
  const p = resolveCatalogProduct(catalogMap, productId)
  if (!p) return null
  const clamped = clampProductGrams(productId, roundGrams(grams), p)
  const portion = formatProductPortion(p, clamped)
  const m = macrosForGrams(p, portion.grams)
  return {
    productId: p.id,
    label: p.label,
    grams: portion.grams,
    portionLabel: portion.display,
    ...m,
  }
}

/** @param {object} plan */
export function recalcPlanTotals(plan) {
  if (!plan?.dayPlan) return plan
  const dayPlan = plan.dayPlan.map((meal) => ({
    ...meal,
    subtotal: sumItems(meal.items ?? []),
  }))
  return {
    ...plan,
    dayPlan,
    totals: sumItems(dayPlan.flatMap((m) => m.items ?? [])),
  }
}

/**
 * @param {object} plan
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @param {string} mealSlot
 * @param {string} productId
 * @param {number} grams
 */
export function setPlanItemGrams(plan, catalogMap, mealSlot, productId, grams) {
  const next = { ...plan, dayPlan: plan.dayPlan.map((m) => ({ ...m, items: [...(m.items ?? [])] })) }
  const meal = next.dayPlan.find((m) => m.slot === mealSlot)
  if (!meal) return recalcPlanTotals(next)
  const idx = meal.items.findIndex((i) => i.productId === productId)
  if (idx < 0) return recalcPlanTotals(next)
  const item = recalcItemFromGrams(catalogMap, productId, grams)
  if (!item) return recalcPlanTotals(next)
  meal.items[idx] = { ...item, userEdited: true }
  return recalcPlanTotals(next)
}

/**
 * Сводная таблица продуктов за день.
 * @param {object | null | undefined} plan
 */
export function buildDayProductSummary(plan) {
  const map = new Map()
  for (const meal of plan?.dayPlan ?? []) {
    for (const item of meal.items ?? []) {
      const cur = map.get(item.productId) ?? {
        productId: item.productId,
        label: item.label,
        grams: 0,
        kcal: 0,
        proteinG: 0,
        fatG: 0,
        carbsG: 0,
      }
      cur.grams += item.grams ?? 0
      cur.kcal += item.kcal ?? 0
      cur.proteinG = Math.round((cur.proteinG + (item.proteinG ?? 0)) * 10) / 10
      cur.fatG = Math.round((cur.fatG + (item.fatG ?? 0)) * 10) / 10
      cur.carbsG = Math.round((cur.carbsG + (item.carbsG ?? 0)) * 10) / 10
      map.set(item.productId, cur)
    }
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      grams: roundGrams(row.grams),
      portionLabel: `${roundGrams(row.grams)} г`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
}
