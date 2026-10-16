/**
 * Добор ккал/белка после clamp порций — нейронка «забывает» цель, мы нет.
 */
import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import { formatProductPortion, macrosForGrams } from './nutritionMacrosCore.js'
import { clampProductGrams, getProductMealRole } from './nutritionMealPairingCore.js'

/** Если порции упёрлись в потолок — докидываем гарнир/орехи/масло (как «добавь рис» у нормального тренера). */
const KCAL_FILLER_IDS = [
  'rice',
  'buckwheat',
  'pasta_whole',
  'potato',
  'oats',
  'banana',
  'nuts_walnut',
  'sunflower_oil',
  'olive_oil',
]

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

function finalizeItem(item, catalogMap) {
  const p = resolveCatalogProduct(catalogMap, item.productId)
  if (!p) return item
  const grams = clampProductGrams(item.productId, item.grams ?? 0, p)
  const portion = formatProductPortion(p, grams)
  const m = macrosForGrams(p, portion.grams)
  return {
    productId: item.productId,
    label: item.label ?? p.label,
    grams: portion.grams,
    portionLabel: portion.display,
    ...m,
  }
}

function topUpPriority(productId, product) {
  const role = getProductMealRole(productId, product)
  if (role === 'protein') return 3
  if (role === 'starchy' || role === 'grain' || role === 'fruit') return 2
  if (role === 'oil_fat' || role === 'nut_fat' || role === 'spread_dairy_fat') return 1
  return 0
}

/**
 * @param {object[]} items
 * @param {number} mealKcalBudget
 * @param {Map} catalogMap
 * @param {{ preferProtein?: boolean }} [opts]
 */
export function topUpMealItemsToBudget(items, mealKcalBudget, catalogMap, opts = {}) {
  if (!items?.length || !(mealKcalBudget > 0)) return items ?? []
  let next = items.map((it) => finalizeItem(it, catalogMap))
  const preferProtein = opts.preferProtein === true
  const step = 10
  const maxRounds = 50

  for (let round = 0; round < maxRounds; round++) {
    const sub = sumItems(next)
    if (sub.kcal >= mealKcalBudget * 0.95) break

    const ranked = next
      .map((it, index) => {
        const p = resolveCatalogProduct(catalogMap, it.productId)
        const capped = clampProductGrams(it.productId, (it.grams ?? 0) + step, p)
        const room = capped - (it.grams ?? 0)
        let pri = topUpPriority(it.productId, p)
        if (preferProtein && getProductMealRole(it.productId, p) === 'protein') pri += 3
        else if (!preferProtein && getProductMealRole(it.productId, p) === 'protein') pri -= 1
        return { index, room, pri }
      })
      .filter((x) => x.room > 0)
      .sort((a, b) => b.pri - a.pri || b.room - a.room)

    if (!ranked.length) {
      const withFiller = tryAppendFiller(next, catalogMap)
      if (!withFiller) break
      next = withFiller
      continue
    }
    const pick = ranked[0]
    const it = next[pick.index]
    next[pick.index] = finalizeItem({ ...it, grams: (it.grams ?? 0) + Math.min(step, pick.room) }, catalogMap)
  }
  return next
}

/**
 * @param {object[]} items
 * @param {Map} catalogMap
 * @returns {object[] | null}
 */
function tryAppendFiller(items, catalogMap) {
  const have = new Set(items.map((i) => i.productId))
  for (const id of KCAL_FILLER_IDS) {
    if (have.has(id)) continue
    const p = resolveCatalogProduct(catalogMap, id)
    if (!p) continue
    const role = getProductMealRole(id, p)
    // Не кладём масло в фруктовый перекус без крупы — только если уже есть крахмал/белок/овощи.
    if (role === 'oil_fat' || role === 'spread_dairy_fat') {
      const roles = items.map((i) => getProductMealRole(i.productId, resolveCatalogProduct(catalogMap, i.productId)))
      if (!roles.some((r) => r === 'starchy' || r === 'grain' || r === 'protein' || r === 'salad')) continue
    }
    const startG = role === 'oil_fat' || role === 'nut_fat' ? 10 : 80
    const grams = clampProductGrams(id, startG, p)
    if (!(grams > 0)) continue
    return [...items, finalizeItem({ productId: id, label: p.label, grams }, catalogMap)]
  }
  return null
}

/**
 * @param {object[]} dayPlan
 * @param {{ kcalTarget: number, proteinAim?: number }} targets
 * @param {Map} catalogMap
 */
export function topUpDayPlanTowardTargets(dayPlan, targets, catalogMap) {
  if (!dayPlan?.length) return dayPlan ?? []
  const kcalTarget = Number(targets?.kcalTarget) || 0
  const proteinAim = Number(targets?.proteinAim) || 0

  // Сначала ккал (крупы/гарнир), белок — отдельным проходом, если недобор.
  let next = dayPlan.map((meal) => {
    const items = topUpMealItemsToBudget(meal.items ?? [], Number(meal.kcalBudget) || 0, catalogMap, {
      preferProtein: false,
    })
    return { ...meal, items, subtotal: sumItems(items) }
  })

  let totals = sumItems(next.flatMap((m) => m.items))

  if (kcalTarget > 0 && totals.kcal < kcalTarget * 0.92) {
    for (let pass = 0; pass < 4 && totals.kcal < kcalTarget * 0.92; pass++) {
      const factor = 1.1 + pass * 0.1
      next = next.map((meal) => {
        const budget = Math.round((Number(meal.kcalBudget) || 0) * factor)
        const items = topUpMealItemsToBudget(meal.items ?? [], budget, catalogMap, {
          preferProtein: false,
        })
        return { ...meal, items, subtotal: sumItems(items) }
      })
      totals = sumItems(next.flatMap((m) => m.items))
    }
  }

  if (proteinAim > 0 && totals.proteinG < proteinAim * 0.9) {
    next = next.map((meal) => {
      const items = topUpMealItemsToBudget(meal.items ?? [], (Number(meal.kcalBudget) || 0) * 1.15, catalogMap, {
        preferProtein: true,
      })
      return { ...meal, items, subtotal: sumItems(items) }
    })
  }

  return next
}

export { sumItems as sumMealItemsForTopUp }
