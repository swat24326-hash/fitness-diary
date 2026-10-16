import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import { parseGramLimitsFromTags, parseMealRoleFromTags, parsePairsWithFromTags } from './nutritionProductPairingTags.js'

/** @typedef {import('./nutritionProductPairingTags.js').MealFoodRole} MealFoodRole */

/** @type {Record<string, MealFoodRole>} */
const PRODUCT_MEAL_ROLE = {
  butter: 'spread_dairy_fat',
  sunflower_oil: 'oil_fat',
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
  protein_drink_hp: 'protein',
  yogurt_greek: 'protein',
  cottage_cheese_soft: 'protein',
  cheese_light: 'protein',
  whey_protein: 'protein',
}

/** Несовместимые роли в одном приёме пищи. */
const INCOMPATIBLE_ROLE_PAIRS = [
  ['spread_dairy_fat', 'fruit'],
  ['spread_dairy_fat', 'salad'],
  ['spread_dairy_fat', 'nut_fat'],
]

/** Реалистичные порции домашней тарелки (не «залповые» граммы под любой бюджет). */
/** @type {Record<string, { min?: number, max?: number }>} */
export const PORTION_LIMITS = {
  vegetables: { max: 250 },
  cucumber: { max: 200 },
  tomato: { max: 200 },
  cabbage: { max: 200 },
  broccoli: { max: 250 },
  zucchini: { max: 250 },
  potato: { min: 150, max: 250 },
  rice: { max: 250 },
  buckwheat: { max: 250 },
  pasta: { max: 250 },
  pasta_whole: { max: 250 },
  millet: { max: 250 },
  pearl_barley: { max: 250 },
  oats: { max: 80 },
  bread_whole: { max: 80 },
  bread_rye: { max: 80 },
  crispbread: { max: 50 },
  banana: { max: 180 },
  apple: { max: 250 },
  berries: { max: 180 },
  orange: { max: 200 },
  pear: { max: 200 },
  kiwi: { max: 150 },
  butter: { max: 10 },
  sunflower_oil: { max: 15 },
  olive_oil: { max: 15 },
  peanut_butter: { max: 30 },
  nuts_walnut: { max: 30 },
  nuts_almond: { max: 30 },
  avocado: { max: 100 },
  eggs: { max: 165 },
  chicken_breast: { max: 220 },
  chicken_thigh: { max: 220 },
  turkey_breast: { max: 220 },
  minced_turkey: { max: 220 },
  beef_lean: { max: 200 },
  fish_white: { max: 250 },
  pollock: { max: 250 },
  salmon: { max: 60 },
  tuna_canned: { max: 180 },
  cottage_cheese_5: { max: 200 },
  cottage_cheese_0: { max: 200 },
  yogurt: { max: 250 },
  yogurt_greek: { max: 250 },
  kefir: { max: 300 },
  protein_drink_hp: { max: 350 },
  cottage_cheese_soft: { max: 120 },
  cheese_light: { max: 60 },
  whey_protein: { min: 20, max: 40 },
  lentils: { max: 220 },
  chickpeas: { max: 200 },
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
  // Берём самое жёсткое: PORTION_LIMITS не должен раздуваться от grams_max в тегах.
  const maxCandidates = [fromTags.max, fromId.max].filter((n) => n != null)
  const minCandidates = [fromTags.min, fromId.min].filter((n) => n != null)
  const limits = {
    min: minCandidates.length ? Math.max(...minCandidates) : undefined,
    max: maxCandidates.length ? Math.min(...maxCandidates) : undefined,
  }
  let g = grams
  if (limits.max != null) g = Math.min(g, limits.max)
  if (limits.min != null) g = Math.max(g, limits.min)
  return g
}
