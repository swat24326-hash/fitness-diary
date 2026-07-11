import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import { parseGramLimitsFromTags, parseMealRoleFromTags, parsePairsWithFromTags } from './nutritionProductPairingTags.js'

/** @typedef {import('./nutritionProductPairingTags.js').MealFoodRole} MealFoodRole */

/** @type {Record<string, MealFoodRole>} */
const PRODUCT_MEAL_ROLE = {
  butter: 'spread_dairy_fat',
  olive_oil: 'oil_fat',
  peanut_butter: 'nut_fat',
  nuts_walnut: 'nut_fat',
  avocado: 'nut_fat',
  banana: 'fruit',
  apple: 'fruit',
  berries: 'fruit',
  vegetables: 'salad',
  potato: 'starchy',
  rice: 'starchy',
  buckwheat: 'starchy',
  pasta: 'starchy',
  oats: 'grain',
  bread_whole: 'grain',
  chicken_breast: 'protein',
  turkey_breast: 'protein',
  fish_white: 'protein',
  salmon: 'protein',
  cottage_cheese_5: 'protein',
  cottage_cheese_0: 'protein',
  eggs: 'protein',
  beef_lean: 'protein',
  kefir: 'protein',
  yogurt: 'protein',
}

/** Несовместимые роли в одном приёме пищи. */
const INCOMPATIBLE_ROLE_PAIRS = [
  ['spread_dairy_fat', 'fruit'],
  ['spread_dairy_fat', 'salad'],
  ['spread_dairy_fat', 'nut_fat'],
]

/** @type {Record<string, { min?: number, max?: number }>} */
export const PORTION_LIMITS = {
  vegetables: { max: 350 },
  potato: { min: 150, max: 400 },
  rice: { max: 350 },
  buckwheat: { max: 350 },
  pasta: { max: 350 },
  oats: { max: 120 },
  bread_whole: { max: 120 },
  banana: { max: 200 },
  apple: { max: 300 },
  berries: { max: 250 },
  butter: { max: 25 },
  olive_oil: { max: 20 },
  peanut_butter: { max: 40 },
  nuts_walnut: { max: 45 },
  avocado: { max: 120 },
  eggs: { max: 300 },
}

/**
 * @param {string} productId
 * @param {import('./nutritionCatalogResolve.js').ResolvedNutritionProduct | null} [product]
 * @returns {MealFoodRole}
 */
export function getProductMealRole(productId, product) {
  const fromTags = parseMealRoleFromTags(product?.tags)
  if (fromTags) return fromTags
  const id = String(productId ?? '')
  if (PRODUCT_MEAL_ROLE[id]) return PRODUCT_MEAL_ROLE[id]
  const group = product?.group
  if (group === 'protein') return 'protein'
  if (group === 'fat') return 'oil_fat'
  if (group === 'carbs') return 'starchy'
  return 'other'
}

/**
 * @param {MealFoodRole} a
 * @param {MealFoodRole} b
 */
export function areMealRolesCompatible(a, b) {
  if (!a || !b || a === 'other' || b === 'other' || a === 'protein' || b === 'protein') return true
  for (const [x, y] of INCOMPATIBLE_ROLE_PAIRS) {
    if ((a === x && b === y) || (a === y && b === x)) return false
  }
  return true
}

/**
 * @param {string} productIdA
 * @param {string} productIdB
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function areProductsCompatibleInMeal(productIdA, productIdB, catalogMap) {
  const a = getProductMealRole(productIdA, resolveCatalogProduct(catalogMap, productIdA))
  const b = getProductMealRole(productIdB, resolveCatalogProduct(catalogMap, productIdB))
  return areMealRolesCompatible(a, b)
}

/**
 * @param {string[]} pool
 * @param {MealFoodRole} carbRole
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
function preferProductsByPairs(pool, carbRole, catalogMap) {
  const matched = pool.filter((id) => {
    const pairs = parsePairsWithFromTags(resolveCatalogProduct(catalogMap, id)?.tags)
    return pairs.includes(/** @type {import('./nutritionProductPairingTags.js').PairWithRole} */ (carbRole))
  })
  return matched.length ? matched : pool
}

/**
 * Белок для приёма пищи с учётом углеводного продукта и тегов pairs:*.
 * @param {string | null} carbId
 * @param {string[]} proteinIds
 * @param {number} mealIndex
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function pickProteinProductId(carbId, proteinIds, mealIndex, catalogMap) {
  if (!proteinIds?.length) return null
  if (!carbId) return proteinIds[mealIndex % proteinIds.length]

  const carbRole = getProductMealRole(carbId, resolveCatalogProduct(catalogMap, carbId))
  let pool = proteinIds.filter((id) => areProductsCompatibleInMeal(carbId, id, catalogMap))
  if (!pool.length) pool = proteinIds
  pool = preferProductsByPairs(pool, carbRole, catalogMap)
  return pool[mealIndex % pool.length]
}

/**
 * Жир для приёма пищи с учётом углеводного продукта.
 * @param {string | null} carbId
 * @param {string[]} fatIds
 * @param {number} mealIndex
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function pickFatProductId(carbId, fatIds, mealIndex, catalogMap) {
  if (!fatIds?.length) return null
  if (!carbId) return fatIds[mealIndex % fatIds.length]

  const carbRole = getProductMealRole(carbId, resolveCatalogProduct(catalogMap, carbId))
  let pool = fatIds.filter((fid) => areProductsCompatibleInMeal(carbId, fid, catalogMap))

  if (carbRole === 'salad') {
    const oils = pool.filter((id) => getProductMealRole(id, resolveCatalogProduct(catalogMap, id)) === 'oil_fat')
    if (oils.length) pool = oils
  }
  if (carbRole === 'fruit') {
    const spreads = pool.filter((id) => {
      const role = getProductMealRole(id, resolveCatalogProduct(catalogMap, id))
      return role === 'nut_fat' || role === 'oil_fat'
    })
    if (spreads.length) pool = spreads
  }
  if (carbRole === 'starchy' || carbRole === 'grain') {
    const dairy = pool.filter((id) => getProductMealRole(id, resolveCatalogProduct(catalogMap, id)) === 'spread_dairy_fat')
    const oils = pool.filter((id) => getProductMealRole(id, resolveCatalogProduct(catalogMap, id)) === 'oil_fat')
    if (dairy.length) pool = dairy
    else if (oils.length) pool = oils
  }

  if (!pool.length) pool = fatIds
  pool = preferProductsByPairs(pool, carbRole, catalogMap)
  return pool[mealIndex % pool.length]
}

/**
 * @param {string} productId
 * @param {number} grams
 * @param {import('./nutritionCatalogResolve.js').ResolvedNutritionProduct | null} [product]
 */
export function clampProductGrams(productId, grams, product) {
  const fromTags = parseGramLimitsFromTags(product?.tags)
  const fromId = PORTION_LIMITS[productId] ?? {}
  const limits = {
    min: fromTags.min ?? fromId.min,
    max: fromTags.max ?? fromId.max,
  }
  let g = grams
  if (limits.max != null) g = Math.min(g, limits.max)
  if (limits.min != null) g = Math.max(g, limits.min)
  return g
}
