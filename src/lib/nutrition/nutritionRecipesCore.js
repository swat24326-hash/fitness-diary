/**
 * Подбор и сборка приёма из книги рецептов (альтернатива простой тарелке).
 */
import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import {
  formatProductPortion,
  gramsForKcal,
  macrosForGrams,
  roundGrams,
} from './nutritionMacrosCore.js'
import { clampProductGrams } from './nutritionMealPairingCore.js'
import { getNutritionProductById } from './nutritionProductCatalog.js'
import { NUTRITION_RECIPE_CATALOG } from './nutritionRecipeCatalog.js'
import { slotKindFromId } from './nutritionDishTemplatesCore.js'
import { buildMealFromDish } from './nutritionDishBuildCore.js'

function normalizeLabel(label) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * @param {{ protein: string[], fat: string[], carbs: string[] }} productIdsByGroup
 */
function allPoolIds(productIdsByGroup) {
  return [
    ...(productIdsByGroup.protein ?? []),
    ...(productIdsByGroup.fat ?? []),
    ...(productIdsByGroup.carbs ?? []),
  ]
}

/** Растительные масла с полки взаимозаменяемы в домашних рецептах. */
const PRODUCT_KEY_FALLBACKS = {
  sunflower_oil: ['olive_oil'],
  olive_oil: ['sunflower_oil'],
  cottage_cheese_5: ['cottage_cheese_0', 'cottage_cheese_soft'],
  cottage_cheese_0: ['cottage_cheese_5', 'cottage_cheese_soft'],
  cottage_cheese_soft: ['cottage_cheese_5', 'cottage_cheese_0'],
  yogurt: ['yogurt_greek', 'protein_drink_hp'],
  yogurt_greek: ['yogurt', 'protein_drink_hp'],
  protein_drink_hp: ['yogurt_greek', 'kefir', 'yogurt'],
  kefir: ['protein_drink_hp', 'yogurt'],
  fish_white: ['pollock', 'tuna_canned'],
  pollock: ['fish_white'],
  chicken_breast: ['chicken_thigh', 'turkey_breast'],
  pasta: ['pasta_whole'],
  pasta_whole: ['pasta'],
  vegetables: ['cucumber', 'tomato', 'cabbage', 'broccoli'],
}

/**
 * Найти продукт клиента по ключу рецепта (builtin id, название или масло-запасной вариант).
 * @param {string} productKey
 * @param {{ protein: string[], fat: string[], carbs: string[] }} productIdsByGroup
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @returns {string | null}
 */
export function resolveRecipeProductKey(productKey, productIdsByGroup, catalogMap) {
  const key = String(productKey ?? '').trim()
  if (!key) return null
  const pool = allPoolIds(productIdsByGroup)
  const tryKeys = [key, ...(PRODUCT_KEY_FALLBACKS[key] ?? [])]

  for (const tryKey of tryKeys) {
    if (pool.includes(tryKey) && resolveCatalogProduct(catalogMap, tryKey)) return tryKey
  }

  for (const tryKey of tryKeys) {
    const builtin = getNutritionProductById(tryKey)
    if (!builtin) continue
    const want = normalizeLabel(builtin.label)
    const byLabel = pool.find((id) => normalizeLabel(resolveCatalogProduct(catalogMap, id)?.label) === want)
    if (byLabel) return byLabel
  }
  return null
}

/**
 * @param {import('./nutritionRecipeCatalog.js').NutritionRecipe} recipe
 * @param {{ protein: string[], fat: string[], carbs: string[] }} productIdsByGroup
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function recipeFitsPool(recipe, productIdsByGroup, catalogMap) {
  for (const part of recipe.parts ?? []) {
    if (part.optional) continue
    if (!resolveRecipeProductKey(part.productKey, productIdsByGroup, catalogMap)) return false
  }
  return (recipe.parts ?? []).length >= 2
}

/**
 * @param {string} slotId
 * @returns {import('./nutritionRecipeCatalog.js').NutritionRecipe[]}
 */
export function recipesForSlot(slotId) {
  const kind = slotKindFromId(slotId)
  return NUTRITION_RECIPE_CATALOG.filter((r) => r.slotKinds.includes(kind))
}

/**
 * @param {string} slotId
 * @param {{ protein: string[], fat: string[], carbs: string[] }} productIdsByGroup
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function listFittingRecipes(slotId, productIdsByGroup, catalogMap) {
  return recipesForSlot(slotId).filter((r) => recipeFitsPool(r, productIdsByGroup, catalogMap))
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

function finalizeItems(items, catalogMap) {
  return items.map((item) => {
    const p = resolveCatalogProduct(catalogMap, item.productId)
    if (!p) return item
    const portion = formatProductPortion(p, item.grams)
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

/**
 * @param {object} p
 * @param {import('./nutritionRecipeCatalog.js').NutritionRecipe} p.recipe
 * @param {number} p.mealKcalBudget
 * @param {{ protein: string[], fat: string[], carbs: string[] }} p.productIdsByGroup
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} p.catalogMap
 * @returns {{ dishId: string, dishLabel: string, recipeId: string, recipeSteps: string[], source: 'recipe', items: object[] } | null}
 */
export function buildMealFromRecipe({ recipe, mealKcalBudget, productIdsByGroup, catalogMap }) {
  /** @type {{ productId: string, share: number }[]} */
  const filled = []
  for (const part of recipe.parts ?? []) {
    const productId = resolveRecipeProductKey(part.productKey, productIdsByGroup, catalogMap)
    if (!productId) {
      if (part.optional) continue
      return null
    }
    filled.push({ productId, share: part.share })
  }
  if (filled.length < 2) return null

  const shareSum = filled.reduce((s, f) => s + f.share, 0) || 1
  const rawItems = []
  for (const f of filled) {
    const product = resolveCatalogProduct(catalogMap, f.productId)
    if (!product) return null
    const kcalShare = mealKcalBudget * (f.share / shareSum)
    let grams = gramsForKcal(product, kcalShare)
    grams = clampProductGrams(f.productId, grams, product)
    const portion = formatProductPortion(product, grams)
    const m = macrosForGrams(product, portion.grams)
    rawItems.push({
      productId: product.id,
      label: product.label,
      grams: portion.grams,
      portionLabel: portion.display,
      ...m,
    })
  }

  return {
    dishId: recipe.id,
    dishLabel: recipe.label,
    recipeId: recipe.id,
    recipeSteps: [...(recipe.steps ?? [])],
    source: /** @type {const} */ ('recipe'),
    items: scaleMealItemsToBudget(rawItems, mealKcalBudget, catalogMap),
  }
}

/**
 * Сколько вариантов блюда для слота (рецепты + 1 тарелка).
 * @param {string} slotId
 * @param {{ protein: string[], fat: string[], carbs: string[] }} productIdsByGroup
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function countMealOptionsForSlot(slotId, productIdsByGroup, catalogMap) {
  return listFittingRecipes(slotId, productIdsByGroup, catalogMap).length + 1
}

/**
 * Смесь: часть слотов — рецепт (если продукты позволяют), часть — простая тарелка.
 * @param {object} p
 * @param {string} p.slotId
 * @param {number} p.mealIndex
 * @param {number} [p.optionOffset] — сдвиг для «другое блюдо» в том же слоте
 * @param {number} p.mealKcalBudget
 * @param {{ protein: string[], fat: string[], carbs: string[] }} p.productIdsByGroup
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} p.catalogMap
 * @param {string} [p.proteinAccent]
 */
export function buildMealForSlot(p) {
  const fitting = listFittingRecipes(p.slotId, p.productIdsByGroup, p.catalogMap)
  // N рецептов + 1 «тарелка» → чередуем, чтобы оставался простой вариант.
  const optionCount = fitting.length + 1
  const offset = Number(p.optionOffset) || 0
  const pick = Math.abs((Number(p.mealIndex) || 0) + offset) % optionCount

  if (pick < fitting.length) {
    const fromRecipe = buildMealFromRecipe({
      recipe: fitting[pick],
      mealKcalBudget: p.mealKcalBudget,
      productIdsByGroup: p.productIdsByGroup,
      catalogMap: p.catalogMap,
    })
    if (fromRecipe?.items?.length) {
      return { ...fromRecipe, optionOffset: offset }
    }
  }

  const plate = buildMealFromDish({ ...p, proteinAccent: p.proteinAccent })
  if (!plate) return null
  return {
    ...plate,
    source: /** @type {const} */ ('plate'),
    recipeId: undefined,
    recipeSteps: undefined,
    optionOffset: offset,
  }
}
