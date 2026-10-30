/**
 * Сборка приёма пищи из шаблона тарелки + пулов продуктов клиента.
 */
import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import { dishLabelFromItems } from './nutritionDishLabelCore.js'
import { getProductFoodCategory } from './nutritionFoodCategoriesCore.js'
import {
  formatProductPortion,
  gramsForKcal,
  macrosForGrams,
  roundGrams,
} from './nutritionMacrosCore.js'
import {
  areProductsCompatibleInMeal,
  clampProductGrams,
  getProductMealRole,
} from './nutritionMealPairingCore.js'
import { preferProteinsForSlotKind } from './nutritionMealSlotFoodCore.js'
import { orderProteinIdsByAccent } from './nutritionProteinAccentCore.js'
import { parsePairsWithFromTags } from './nutritionProductPairingTags.js'
import { pickDishTemplate, slotKindFromId, templatesForSlot } from './nutritionDishTemplatesCore.js'

/** Роли, которые берём из пула углеводов. */
const CARB_ROLES = new Set(['fruit', 'salad', 'starchy', 'grain'])
/** Роли из пула жиров. */
const FAT_ROLES = new Set(['spread_dairy_fat', 'oil_fat', 'nut_fat'])

/**
 * @param {import('./nutritionDishTemplatesCore.js').DishPartRole} role
 * @returns {'protein'|'fat'|'carbs'}
 */
function poolGroupForRole(role) {
  if (role === 'protein') return 'protein'
  if (FAT_ROLES.has(role)) return 'fat'
  return 'carbs'
}

/**
 * @param {string} productId
 * @param {import('./nutritionCatalogResolve.js').ResolvedNutritionProduct | null | undefined} product
 * @param {string[] | undefined} foodCats
 */
function matchesFoodCats(productId, product, foodCats) {
  if (!foodCats?.length) return true
  const cat = getProductFoodCategory(product)
  if (cat && foodCats.includes(cat)) return true
  const id = String(productId ?? '')
  const label = String(product?.label ?? '').toLowerCase()
  if (foodCats.includes('potato') && (id === 'potato' || label.includes('картофел'))) return true
  if (foodCats.includes('pasta') && (id === 'pasta' || id === 'pasta_whole' || label.includes('макарон'))) return true
  return false
}

/**
 * @param {string[]} pool
 * @param {import('./nutritionDishTemplatesCore.js').DishPartRole} role
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @param {string[]} [foodCats]
 */
function candidatesForRole(pool, role, catalogMap, foodCats) {
  return (pool ?? []).filter((id) => {
    const product = resolveCatalogProduct(catalogMap, id)
    if (getProductMealRole(id, product) !== role) return false
    return matchesFoodCats(id, product, foodCats)
  })
}

/**
 * @param {string[]} candidates
 * @param {string[]} alreadyIds
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
function filterCompatible(candidates, alreadyIds, catalogMap) {
  if (!alreadyIds.length) return candidates
  return candidates.filter((id) => alreadyIds.every((other) => areProductsCompatibleInMeal(id, other, catalogMap)))
}

/**
 * Предпочитаем продукты с pairs: под уже выбранный «якорь» (часто гарнир/фрукт).
 * @param {string[]} candidates
 * @param {string | null} anchorId
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
function preferByPairs(candidates, anchorId, catalogMap) {
  if (!anchorId || !candidates.length) return candidates
  const anchorRole = getProductMealRole(anchorId, resolveCatalogProduct(catalogMap, anchorId))
  if (!CARB_ROLES.has(anchorRole) && anchorRole !== 'protein') return candidates
  const matched = candidates.filter((id) => {
    const pairs = parsePairsWithFromTags(resolveCatalogProduct(catalogMap, id)?.tags)
    return pairs.includes(/** @type {import('./nutritionProductPairingTags.js').PairWithRole} */ (anchorRole))
  })
  return matched.length ? matched : candidates
}

/**
 * Для творожного шаблона — белки, которые дружат с фруктом.
 * @param {string[]} proteinPool
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
function dairyFriendlyProteins(proteinPool, catalogMap) {
  const dairy = proteinPool.filter((id) => {
    const pairs = parsePairsWithFromTags(resolveCatalogProduct(catalogMap, id)?.tags)
    return pairs.includes('fruit')
  })
  return dairy.length ? dairy : proteinPool
}

/**
 * @param {object} p
 * @param {import('./nutritionDishTemplatesCore.js').DishTemplate} p.template
 * @param {{ protein: string[], fat: string[], carbs: string[] }} p.productIdsByGroup
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} p.catalogMap
 * @param {number} p.mealIndex
 * @param {'breakfast'|'lunch'|'dinner'|'snack'} [p.slotKind]
 * @param {string} [p.proteinAccent]
 * @returns {{ productId: string, role: string }[] | null}
 */
export function fillDishParts({ template, productIdsByGroup, catalogMap, mealIndex, slotKind, proteinAccent }) {
  /** @type {{ productId: string, role: string }[]} */
  const filled = []
  let anchorCarbId = null
  const kind = slotKind ?? 'lunch'

  for (const part of template.parts) {
    const group = poolGroupForRole(part.role)
    let pool = productIdsByGroup[group] ?? []
    if (part.role === 'protein') {
      pool = orderProteinIdsByAccent(pool, proteinAccent)
      pool = preferProteinsForSlotKind(pool, kind, catalogMap)
      if (template.id === 'cottage_fruit') {
        pool = dairyFriendlyProteins(pool, catalogMap)
      }
    }

    let candidates = candidatesForRole(pool, part.role, catalogMap, part.foodCats)
    if (part.role === 'starchy' && !part.foodCats?.length) {
      // Без meal_role клубные углеводы часто все «starchy»; если роли узкие — берём любой карб.
      // Не подменяем, если часть требует конкретную полку (картофель и т.п.).
      for (const fallback of /** @type {const} */ (['grain', 'fruit', 'salad'])) {
        if (candidates.length) break
        candidates = candidatesForRole(pool, fallback, catalogMap)
      }
    }
    if (part.role === 'nut_fat' && !candidates.length) {
      candidates = candidatesForRole(pool, 'oil_fat', catalogMap)
    }

    candidates = filterCompatible(candidates, filled.map((f) => f.productId), catalogMap)
    if (anchorCarbId) candidates = preferByPairs(candidates, anchorCarbId, catalogMap)
    else if (filled.length) candidates = preferByPairs(candidates, filled[0].productId, catalogMap)

    if (!candidates.length) {
      if (part.optional) continue
      return null
    }

    const pick = candidates[Math.abs(mealIndex + filled.length) % candidates.length]
    filled.push({ productId: pick, role: part.role })
    const role = getProductMealRole(pick, resolveCatalogProduct(catalogMap, pick))
    if (CARB_ROLES.has(role)) anchorCarbId = pick
  }

  return filled.length ? filled : null
}

/**
 * @param {import('./nutritionCatalogResolve.js').ResolvedNutritionProduct | null} product
 * @param {string} productId
 * @param {number} kcalShare
 */
function buildItemFromKcal(product, productId, kcalShare) {
  if (!product || kcalShare <= 0) return null
  let grams = gramsForKcal(product, kcalShare)
  grams = clampProductGrams(productId, grams, product)
  const portion = formatProductPortion(product, grams)
  const m = macrosForGrams(product, portion.grams)
  return {
    productId: product.id,
    label: product.label,
    grams: portion.grams,
    portionLabel: portion.display,
    ...m,
  }
}

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

function scaleMealItemsToBudget(items, mealKcalBudget, catalogMap) {
  const subtotal = sumItems(items)
  if (!subtotal.kcal) return items
  const tolerance = mealKcalBudget * 0.05
  if (subtotal.kcal >= mealKcalBudget - tolerance && subtotal.kcal <= mealKcalBudget + tolerance) {
    return finalizeItems(items, catalogMap)
  }
  const factor = mealKcalBudget / subtotal.kcal
  const scaled = items.map((item) => {
    const grams = roundGrams((item.grams ?? 0) * factor)
    return { ...item, grams, portionLabel: `${grams} г` }
  })
  return finalizeItems(scaled, catalogMap)
}

function finalizeItems(items, catalogMap) {
  return items.map((item) => {
    const p = resolveCatalogProduct(catalogMap, item.productId)
    if (!p) return item
    const grams = clampProductGrams(item.productId, item.grams ?? 0, p)
    const portion = formatProductPortion(p, grams)
    const m = macrosForGrams(p, portion.grams)
    return {
      productId: item.productId,
      label: item.label,
      grams: portion.grams,
      portionLabel: portion.display,
      ...m,
    }
  })
}

/**
 * Нормализует доли только по реально заполненным частям.
 * @param {import('./nutritionDishTemplatesCore.js').DishTemplate} template
 * @param {{ productId: string, role: string }[]} filled
 */
function sharesForFilled(template, filled) {
  const roles = new Set(filled.map((f) => f.role))
  const parts = template.parts.filter((p) => roles.has(p.role))
  const sum = parts.reduce((s, p) => s + p.share, 0) || 1
  /** @type {Record<string, number>} */
  const byRole = {}
  for (const p of parts) byRole[p.role] = p.share / sum
  return byRole
}

/**
 * @param {object} p
 * @param {string} p.slotId
 * @param {number} p.mealIndex
 * @param {number} p.mealKcalBudget
 * @param {{ protein: string[], fat: string[], carbs: string[] }} p.productIdsByGroup
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} p.catalogMap
 * @param {string} [p.proteinAccent]
 * @returns {{ dishId: string, dishLabel: string, items: object[] } | null}
 */
export function buildMealFromDish({ slotId, mealIndex, mealKcalBudget, productIdsByGroup, catalogMap, proteinAccent }) {
  const pool = templatesForSlot(slotId)
  const kind = slotKindFromId(slotId)
  const tried = new Set()
  const start = pickDishTemplate(slotId, mealIndex, pool)

  for (let offset = 0; offset < pool.length + 1; offset++) {
    const template = offset === 0 ? start : pool[(pool.indexOf(start) + offset) % pool.length] ?? start
    if (tried.has(template.id)) continue
    tried.add(template.id)

    const filled = fillDishParts({
      template,
      productIdsByGroup,
      catalogMap,
      mealIndex,
      slotKind: kind,
      proteinAccent,
    })
    if (!filled) continue

    const shares = sharesForFilled(template, filled)
    const rawItems = []
    for (const f of filled) {
      const product = resolveCatalogProduct(catalogMap, f.productId)
      const share = shares[f.role] ?? 0
      const item = buildItemFromKcal(product, f.productId, mealKcalBudget * share)
      if (item) rawItems.push(item)
    }
    if (rawItems.length < 2 && mealKcalBudget > 100) continue

    const items = scaleMealItemsToBudget(rawItems, mealKcalBudget, catalogMap)
    return {
      dishId: template.id,
      dishLabel: dishLabelFromItems(items, catalogMap, template.label),
      items,
    }
  }

  return null
}
