/**
 * Пищевые полки для опросника «Не ем» и админки (не БЖУ).
 * Человек думает «не ем молочку / рыбу», а не «не ем углеводы».
 */
import { resolveCatalogProduct } from './nutritionCatalogResolve.js'

/** @typedef {'meat'|'seafood'|'dairy'|'eggs'|'oils'|'nuts'|'grains'|'pasta'|'potato'|'bread'|'legumes'|'vegetables'|'fruits'} NutritionFoodCategoryId */

/**
 * @type {{ id: NutritionFoodCategoryId, label: string, hint: string }[]}
 */
export const NUTRITION_FOOD_CATEGORIES = [
  { id: 'meat', label: 'Мясо и птица', hint: 'курица, индейка, говядина, фарш' },
  { id: 'seafood', label: 'Рыба', hint: 'минтай, тунец, лосось' },
  { id: 'dairy', label: 'Молочка', hint: 'творог, кефир, йогурт, сыр, молоко, масло' },
  { id: 'eggs', label: 'Яйца', hint: 'яйцо куриное' },
  { id: 'oils', label: 'Растительные масла', hint: 'подсолнечное, оливковое' },
  { id: 'nuts', label: 'Орехи и пасты', hint: 'орехи, арахисовая паста, авокадо' },
  { id: 'grains', label: 'Крупы', hint: 'гречка, рис, овсянка, пшено, перловка' },
  { id: 'pasta', label: 'Макароны', hint: 'обычные и цельнозерновые' },
  { id: 'potato', label: 'Картофель', hint: 'варёный картофель' },
  { id: 'bread', label: 'Хлеб и хлебцы', hint: 'цельнозерновой, ржаной, хлебцы' },
  { id: 'legumes', label: 'Бобовые', hint: 'чечевица, нут' },
  { id: 'vegetables', label: 'Овощи', hint: 'огурец, помидор, капуста, салат-микс…' },
  { id: 'fruits', label: 'Фрукты и ягоды', hint: 'яблоко, банан, ягоды, апельсин…' },
]

const VALID = new Set(NUTRITION_FOOD_CATEGORIES.map((c) => c.id))

/** Старые теги food_cat:sides → крупы (миграция чтения). */
const LEGACY_FOOD_CAT = {
  sides: 'grains',
}

/**
 * @param {string[] | undefined} tags
 * @returns {NutritionFoodCategoryId | null}
 */
export function parseFoodCategoryFromTags(tags) {
  for (const t of tags ?? []) {
    const m = String(t).match(/^food_cat:(.+)$/)
    if (!m) continue
    const raw = m[1]
    const id = LEGACY_FOOD_CAT[raw] ?? raw
    if (VALID.has(/** @type {NutritionFoodCategoryId} */ (id))) {
      return /** @type {NutritionFoodCategoryId} */ (id)
    }
  }
  return null
}

/**
 * @param {import('./nutritionCatalogResolve.js').ResolvedNutritionProduct | null | undefined} product
 * @returns {NutritionFoodCategoryId | null}
 */
export function getProductFoodCategory(product) {
  return parseFoodCategoryFromTags(product?.tags) ?? null
}

/**
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @param {NutritionFoodCategoryId} categoryId
 */
export function listCatalogProductsByFoodCategory(catalogMap, categoryId) {
  return [...catalogMap.values()]
    .filter((p) => getProductFoodCategory(p) === categoryId)
    .sort((a, b) => a.label.localeCompare(b.label, 'ru'))
}

/**
 * @param {object} p
 * @param {NutritionFoodCategoryId} p.categoryId
 * @param {string[]} p.avoidProductIds
 * @param {string[]} p.exclusions
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} p.catalogMap
 */
export function foodCategoryAvoidStats({ categoryId, avoidProductIds, exclusions, catalogMap }) {
  const products = listCatalogProductsByFoodCategory(catalogMap, categoryId)
  const avoid = new Set((avoidProductIds ?? []).map(String))
  const ex = new Set((exclusions ?? []).map(String))
  let avoided = 0
  let blocked = 0
  /** @type {string[]} */
  const toggleableIds = []
  for (const p of products) {
    const isBlocked = p.tags?.some((t) => ex.has(t))
    if (isBlocked) {
      blocked++
      continue
    }
    toggleableIds.push(p.id)
    if (avoid.has(p.id)) avoided++
  }
  return {
    total: products.length,
    avoided,
    blocked,
    toggleableIds,
    allAvoided: toggleableIds.length > 0 && avoided === toggleableIds.length,
  }
}

/**
 * @param {string[]} avoidProductIds
 * @param {string[]} categoryProductIds
 * @param {boolean} avoidAll
 */
export function setCategoryAvoided(avoidProductIds, categoryProductIds, avoidAll) {
  const set = new Set((avoidProductIds ?? []).map(String))
  for (const id of categoryProductIds) {
    if (avoidAll) set.add(id)
    else set.delete(id)
  }
  return [...set]
}

/**
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function listProductsMissingFoodCategory(catalogMap) {
  return [...catalogMap.values()].filter((p) => !getProductFoodCategory(p)).map((p) => p.id)
}

/**
 * @param {string} productId
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function resolveFoodCategoryForProductId(productId, catalogMap) {
  return getProductFoodCategory(resolveCatalogProduct(catalogMap, productId))
}
