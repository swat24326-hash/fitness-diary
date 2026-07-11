/** @typedef {'protein' | 'fat' | 'carbs'} NutritionMacroGroup */

/**
 * @typedef {object} NutritionProduct
 * @property {string} id
 * @property {string} label
 * @property {NutritionMacroGroup} group
 * @property {number} proteinPer100
 * @property {number} fatPer100
 * @property {number} carbsPer100
 * @property {number} [pieceGrams] — для отображения «шт» (яйцо и т.п.)
 * @property {string[]} [tags] — lactose, gluten… для exclusions
 */

/** @type {NutritionProduct[]} */
export const NUTRITION_PRODUCT_CATALOG = [
  { id: 'chicken_breast', label: 'Куриная грудка', group: 'protein', proteinPer100: 23, fatPer100: 1.5, carbsPer100: 0 },
  { id: 'turkey_breast', label: 'Индейка', group: 'protein', proteinPer100: 21, fatPer100: 1, carbsPer100: 0 },
  { id: 'fish_white', label: 'Белая рыба', group: 'protein', proteinPer100: 18, fatPer100: 1, carbsPer100: 0 },
  { id: 'salmon', label: 'Лосось', group: 'protein', proteinPer100: 20, fatPer100: 13, carbsPer100: 0 },
  { id: 'cottage_cheese_5', label: 'Творог 5%', group: 'protein', proteinPer100: 17, fatPer100: 5, carbsPer100: 2, tags: ['lactose'] },
  { id: 'cottage_cheese_0', label: 'Творог 0%', group: 'protein', proteinPer100: 18, fatPer100: 0.5, carbsPer100: 3, tags: ['lactose'] },
  { id: 'eggs', label: 'Яйцо куриное', group: 'protein', proteinPer100: 13, fatPer100: 11, carbsPer100: 1, pieceGrams: 55 },
  { id: 'beef_lean', label: 'Говядина постная', group: 'protein', proteinPer100: 21, fatPer100: 8, carbsPer100: 0 },
  { id: 'kefir', label: 'Кефир 1%', group: 'protein', proteinPer100: 3, fatPer100: 1, carbsPer100: 4, tags: ['lactose'] },

  { id: 'olive_oil', label: 'Оливковое масло', group: 'fat', proteinPer100: 0, fatPer100: 100, carbsPer100: 0 },
  { id: 'butter', label: 'Сливочное масло', group: 'fat', proteinPer100: 0.5, fatPer100: 82, carbsPer100: 0.5, tags: ['lactose'] },
  { id: 'nuts_walnut', label: 'Грецкий орех', group: 'fat', proteinPer100: 15, fatPer100: 65, carbsPer100: 7 },
  { id: 'avocado', label: 'Авокадо', group: 'fat', proteinPer100: 2, fatPer100: 15, carbsPer100: 9 },
  { id: 'peanut_butter', label: 'Арахисовая паста', group: 'fat', proteinPer100: 25, fatPer100: 50, carbsPer100: 20 },

  { id: 'oats', label: 'Овсянка (сухая)', group: 'carbs', proteinPer100: 13, fatPer100: 6, carbsPer100: 62 },
  { id: 'buckwheat', label: 'Гречка (варёная)', group: 'carbs', proteinPer100: 4, fatPer100: 1, carbsPer100: 21 },
  { id: 'rice', label: 'Рис (варёный)', group: 'carbs', proteinPer100: 2.5, fatPer100: 0.3, carbsPer100: 28 },
  { id: 'pasta', label: 'Макароны (варёные)', group: 'carbs', proteinPer100: 5, fatPer100: 1, carbsPer100: 30, tags: ['gluten'] },
  { id: 'bread_whole', label: 'Хлеб цельнозерновой', group: 'carbs', proteinPer100: 9, fatPer100: 3, carbsPer100: 43, tags: ['gluten'] },
  { id: 'potato', label: 'Картофель (варёный)', group: 'carbs', proteinPer100: 2, fatPer100: 0.1, carbsPer100: 17 },
  { id: 'vegetables', label: 'Овощи (салат)', group: 'carbs', proteinPer100: 1.5, fatPer100: 0.2, carbsPer100: 5 },
  { id: 'apple', label: 'Яблоко', group: 'carbs', proteinPer100: 0.3, fatPer100: 0.2, carbsPer100: 14 },
  { id: 'banana', label: 'Банан', group: 'carbs', proteinPer100: 1, fatPer100: 0.3, carbsPer100: 23 },
  { id: 'berries', label: 'Ягоды', group: 'carbs', proteinPer100: 0.7, fatPer100: 0.3, carbsPer100: 12 },
]

const byId = new Map(NUTRITION_PRODUCT_CATALOG.map((p) => [p.id, p]))

export function getNutritionProductById(id) {
  return byId.get(id) ?? null
}

export function listNutritionProductsByGroup(group) {
  return NUTRITION_PRODUCT_CATALOG.filter((p) => p.group === group)
}

export function filterNutritionProductsByExclusions(productIds, exclusions) {
  const ex = new Set((exclusions ?? []).map((x) => String(x)))
  return productIds.filter((id) => {
    const p = getNutritionProductById(id)
    if (!p?.tags?.length) return true
    return !p.tags.some((t) => ex.has(t))
  })
}
