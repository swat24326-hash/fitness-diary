/** @typedef {'protein' | 'fat' | 'carbs'} NutritionMacroGroup */

/**
 * @typedef {object} NutritionProduct
 * @property {string} id
 * @property {string} label
 * @property {NutritionMacroGroup} group — для сборки тарелки (Б/Ж/У)
 * @property {number} proteinPer100
 * @property {number} fatPer100
 * @property {number} carbsPer100
 * @property {number} [fiberPer100] — клетчатка г/100 г
 * @property {number} [pieceGrams]
 * @property {string[]} [tags] — food_cat:* + meal_role:* + pairs:* + suitable:* + lactose/gluten
 */

/**
 * Базовая полка клуба (Пятёрочка/Магнит, ЦФО).
 * Первично думаем полками (мясо, рыба, молочка…); group — куда класть в тарелку.
 * @type {NutritionProduct[]}
 */
export const NUTRITION_PRODUCT_CATALOG = [
  // —— Мясо и птица ——
  { id: 'chicken_breast', label: 'Куриная грудка', group: 'protein', proteinPer100: 23, fatPer100: 1.5, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:meat', 'meal_role:protein', 'pairs:starchy', 'pairs:grain', 'suitable:main', 'grams_max:220'] },
  { id: 'chicken_thigh', label: 'Куриное бедро без кожи', group: 'protein', proteinPer100: 19, fatPer100: 8, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:meat', 'meal_role:protein', 'pairs:starchy', 'pairs:grain', 'suitable:main', 'grams_max:220'] },
  { id: 'turkey_breast', label: 'Индейка', group: 'protein', proteinPer100: 21, fatPer100: 1, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:meat', 'meal_role:protein', 'pairs:starchy', 'pairs:grain', 'suitable:main', 'grams_max:220'] },
  { id: 'beef_lean', label: 'Говядина постная', group: 'protein', proteinPer100: 21, fatPer100: 8, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:meat', 'meal_role:protein', 'pairs:starchy', 'pairs:grain', 'suitable:main', 'grams_max:200'] },
  { id: 'minced_turkey', label: 'Фарш индейки', group: 'protein', proteinPer100: 20, fatPer100: 7, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:meat', 'meal_role:protein', 'pairs:starchy', 'pairs:grain', 'suitable:main', 'grams_max:220'] },

  // —— Рыба ——
  { id: 'fish_white', label: 'Белая рыба', group: 'protein', proteinPer100: 18, fatPer100: 1, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:seafood', 'meal_role:protein', 'pairs:starchy', 'pairs:salad', 'suitable:main'] },
  { id: 'pollock', label: 'Минтай', group: 'protein', proteinPer100: 16, fatPer100: 0.9, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:seafood', 'meal_role:protein', 'pairs:starchy', 'pairs:salad', 'suitable:main'] },
  { id: 'salmon', label: 'Лосось / сёмга слабосолёная', group: 'protein', proteinPer100: 20, fatPer100: 13, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:seafood', 'meal_role:protein', 'pairs:starchy', 'pairs:grain', 'suitable:main', 'suitable:breakfast', 'grams_max:60'] },
  { id: 'tuna_canned', label: 'Тунец в собственном соку', group: 'protein', proteinPer100: 25, fatPer100: 1, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:seafood', 'meal_role:protein', 'pairs:salad', 'pairs:grain', 'suitable:main', 'suitable:breakfast'] },

  // —— Яйца ——
  { id: 'eggs', label: 'Яйцо куриное', group: 'protein', proteinPer100: 13, fatPer100: 11, carbsPer100: 1, fiberPer100: 0, pieceGrams: 55, tags: ['food_cat:eggs', 'meal_role:protein', 'pairs:starchy', 'pairs:grain', 'suitable:breakfast', 'grams_max:165'] },

  // —— Молочка ——
  { id: 'cottage_cheese_5', label: 'Творог 5%', group: 'protein', proteinPer100: 17, fatPer100: 5, carbsPer100: 2, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast'] },
  { id: 'cottage_cheese_0', label: 'Творог 0%', group: 'protein', proteinPer100: 18, fatPer100: 0.5, carbsPer100: 3, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast'] },
  { id: 'kefir', label: 'Кефир 1%', group: 'protein', proteinPer100: 3, fatPer100: 1, carbsPer100: 4, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast'] },
  { id: 'yogurt', label: 'Йогурт натуральный', group: 'protein', proteinPer100: 10, fatPer100: 2, carbsPer100: 4, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast'] },
  { id: 'protein_drink_hp', label: 'Белковый напиток 0% (Exponenta и аналоги)', group: 'protein', proteinPer100: 12, fatPer100: 0.2, carbsPer100: 4.5, fiberPer100: 0, pieceGrams: 250, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast', 'grams_max:350'] },
  { id: 'yogurt_greek', label: 'Йогурт греческий', group: 'protein', proteinPer100: 8, fatPer100: 2, carbsPer100: 4, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast'] },
  { id: 'cottage_cheese_soft', label: 'Творожный сыр 5%', group: 'protein', proteinPer100: 10, fatPer100: 5, carbsPer100: 3, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast', 'grams_max:150'] },
  { id: 'cheese_light', label: 'Сыр лёгкий (до 17%)', group: 'protein', proteinPer100: 28, fatPer100: 15, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:grain', 'pairs:salad', 'suitable:breakfast', 'suitable:main', 'grams_max:80'] },
  { id: 'whey_protein', label: 'Протеин сывороточный (сухой)', group: 'protein', proteinPer100: 75, fatPer100: 5, carbsPer100: 8, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast', 'grams_min:20', 'grams_max:40'] },
  { id: 'milk_1', label: 'Молоко 1%', group: 'protein', proteinPer100: 3.2, fatPer100: 1, carbsPer100: 4.8, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:grain', 'suitable:breakfast', 'grams_max:300'] },
  { id: 'ryazhenka', label: 'Ряженка 2.5%', group: 'protein', proteinPer100: 3, fatPer100: 2.5, carbsPer100: 4.2, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:protein', 'pairs:fruit', 'pairs:grain', 'suitable:breakfast'] },
  { id: 'butter', label: 'Сливочное масло', group: 'fat', proteinPer100: 0.5, fatPer100: 82, carbsPer100: 0.5, fiberPer100: 0, tags: ['food_cat:dairy', 'lactose', 'meal_role:spread_dairy_fat', 'pairs:starchy', 'pairs:grain', 'grams_max:15'] },

  // —— Масла ——
  { id: 'sunflower_oil', label: 'Масло подсолнечное', group: 'fat', proteinPer100: 0, fatPer100: 100, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:oils', 'meal_role:oil_fat', 'pairs:salad', 'pairs:starchy', 'pairs:grain', 'grams_max:20'] },
  { id: 'olive_oil', label: 'Оливковое масло', group: 'fat', proteinPer100: 0, fatPer100: 100, carbsPer100: 0, fiberPer100: 0, tags: ['food_cat:oils', 'meal_role:oil_fat', 'pairs:salad', 'pairs:starchy', 'pairs:grain', 'grams_max:20'] },

  // —— Орехи ——
  { id: 'nuts_walnut', label: 'Грецкий орех', group: 'fat', proteinPer100: 15, fatPer100: 65, carbsPer100: 7, fiberPer100: 6, tags: ['food_cat:nuts', 'meal_role:nut_fat', 'pairs:fruit', 'pairs:grain', 'grams_max:45'] },
  { id: 'nuts_almond', label: 'Миндаль', group: 'fat', proteinPer100: 21, fatPer100: 53, carbsPer100: 13, fiberPer100: 12, tags: ['food_cat:nuts', 'meal_role:nut_fat', 'pairs:fruit', 'pairs:grain', 'grams_max:40'] },
  { id: 'avocado', label: 'Авокадо', group: 'fat', proteinPer100: 2, fatPer100: 15, carbsPer100: 9, fiberPer100: 7, tags: ['food_cat:nuts', 'meal_role:nut_fat', 'pairs:salad', 'pairs:starchy', 'grams_max:120'] },
  { id: 'peanut_butter', label: 'Арахисовая паста', group: 'fat', proteinPer100: 25, fatPer100: 50, carbsPer100: 20, fiberPer100: 6, tags: ['food_cat:nuts', 'meal_role:nut_fat', 'pairs:fruit', 'pairs:grain', 'grams_max:40'] },

  // —— Крупы ——
  { id: 'oats', label: 'Овсянка (сухая)', group: 'carbs', proteinPer100: 13, fatPer100: 6, carbsPer100: 62, fiberPer100: 10, tags: ['food_cat:grains', 'meal_role:grain', 'grams_max:120'] },
  { id: 'buckwheat', label: 'Гречка (варёная)', group: 'carbs', proteinPer100: 4, fatPer100: 1, carbsPer100: 21, fiberPer100: 3, tags: ['food_cat:grains', 'meal_role:starchy', 'grams_max:350'] },
  { id: 'rice', label: 'Рис (варёный)', group: 'carbs', proteinPer100: 2.5, fatPer100: 0.3, carbsPer100: 28, fiberPer100: 0.4, tags: ['food_cat:grains', 'meal_role:starchy', 'grams_max:350'] },
  { id: 'millet', label: 'Пшено (варёное)', group: 'carbs', proteinPer100: 3.5, fatPer100: 1, carbsPer100: 23, fiberPer100: 1.5, tags: ['food_cat:grains', 'meal_role:starchy', 'grams_max:350'] },
  { id: 'pearl_barley', label: 'Перловка (варёная)', group: 'carbs', proteinPer100: 3, fatPer100: 0.4, carbsPer100: 22, fiberPer100: 3, tags: ['food_cat:grains', 'meal_role:starchy', 'grams_max:350'] },

  // —— Макароны / картофель ——
  { id: 'pasta', label: 'Макароны (варёные)', group: 'carbs', proteinPer100: 5, fatPer100: 1, carbsPer100: 30, fiberPer100: 1.8, tags: ['food_cat:pasta', 'gluten', 'meal_role:starchy', 'grams_max:250'] },
  { id: 'pasta_whole', label: 'Макароны цельнозерновые (варёные)', group: 'carbs', proteinPer100: 5.5, fatPer100: 1.2, carbsPer100: 27, fiberPer100: 4, tags: ['food_cat:pasta', 'gluten', 'meal_role:starchy', 'grams_max:250'] },
  { id: 'potato', label: 'Картофель (варёный)', group: 'carbs', proteinPer100: 2, fatPer100: 0.1, carbsPer100: 17, fiberPer100: 1.5, tags: ['food_cat:potato', 'meal_role:starchy', 'grams_min:150', 'grams_max:250'] },

  // —— Хлеб ——
  { id: 'bread_whole', label: 'Хлеб цельнозерновой', group: 'carbs', proteinPer100: 9, fatPer100: 3, carbsPer100: 43, fiberPer100: 7, tags: ['food_cat:bread', 'gluten', 'meal_role:grain', 'grams_max:80'] },
  { id: 'bread_rye', label: 'Хлеб ржаной', group: 'carbs', proteinPer100: 7, fatPer100: 1.5, carbsPer100: 40, fiberPer100: 6, tags: ['food_cat:bread', 'gluten', 'meal_role:grain', 'grams_max:120'] },
  { id: 'crispbread', label: 'Хлебцы', group: 'carbs', proteinPer100: 10, fatPer100: 2, carbsPer100: 65, fiberPer100: 12, tags: ['food_cat:bread', 'gluten', 'meal_role:grain', 'grams_max:60'] },

  // —— Бобовые ——
  { id: 'lentils', label: 'Чечевица (варёная)', group: 'carbs', proteinPer100: 9, fatPer100: 0.4, carbsPer100: 20, fiberPer100: 8, tags: ['food_cat:legumes', 'meal_role:starchy', 'pairs:salad', 'grams_max:300'] },
  { id: 'chickpeas', label: 'Нут (варёный)', group: 'carbs', proteinPer100: 8, fatPer100: 2.5, carbsPer100: 27, fiberPer100: 7, tags: ['food_cat:legumes', 'meal_role:starchy', 'pairs:salad', 'grams_max:250'] },

  // —— Овощи ——
  { id: 'vegetables', label: 'Овощи (салат)', group: 'carbs', proteinPer100: 1.5, fatPer100: 0.2, carbsPer100: 5, fiberPer100: 2, tags: ['food_cat:vegetables', 'meal_role:salad', 'grams_max:250'] },
  { id: 'cucumber', label: 'Огурец', group: 'carbs', proteinPer100: 0.8, fatPer100: 0.1, carbsPer100: 2.5, fiberPer100: 0.7, tags: ['food_cat:vegetables', 'meal_role:salad', 'grams_max:300'] },
  { id: 'tomato', label: 'Помидор', group: 'carbs', proteinPer100: 0.9, fatPer100: 0.2, carbsPer100: 3.9, fiberPer100: 1.2, tags: ['food_cat:vegetables', 'meal_role:salad', 'grams_max:300'] },
  { id: 'cabbage', label: 'Капуста белокочанная', group: 'carbs', proteinPer100: 1.8, fatPer100: 0.1, carbsPer100: 4.7, fiberPer100: 2.5, tags: ['food_cat:vegetables', 'meal_role:salad', 'grams_max:300'] },
  { id: 'carrot', label: 'Морковь', group: 'carbs', proteinPer100: 1.3, fatPer100: 0.1, carbsPer100: 7, fiberPer100: 2.4, tags: ['food_cat:vegetables', 'meal_role:salad', 'grams_max:200'] },
  { id: 'broccoli', label: 'Брокколи', group: 'carbs', proteinPer100: 2.8, fatPer100: 0.4, carbsPer100: 5, fiberPer100: 3, tags: ['food_cat:vegetables', 'meal_role:salad', 'grams_max:300'] },
  { id: 'zucchini', label: 'Кабачок', group: 'carbs', proteinPer100: 1.2, fatPer100: 0.3, carbsPer100: 3.5, fiberPer100: 1, tags: ['food_cat:vegetables', 'meal_role:salad', 'grams_max:350'] },

  // —— Фрукты ——
  { id: 'apple', label: 'Яблоко', group: 'carbs', proteinPer100: 0.3, fatPer100: 0.2, carbsPer100: 14, fiberPer100: 2.4, tags: ['food_cat:fruits', 'meal_role:fruit', 'grams_max:300'] },
  { id: 'banana', label: 'Банан', group: 'carbs', proteinPer100: 1, fatPer100: 0.3, carbsPer100: 23, fiberPer100: 2.6, tags: ['food_cat:fruits', 'meal_role:fruit', 'grams_max:200'] },
  { id: 'berries', label: 'Ягоды', group: 'carbs', proteinPer100: 0.7, fatPer100: 0.3, carbsPer100: 12, fiberPer100: 4, tags: ['food_cat:fruits', 'meal_role:fruit', 'grams_max:250'] },
  { id: 'orange', label: 'Апельсин', group: 'carbs', proteinPer100: 0.9, fatPer100: 0.1, carbsPer100: 8, fiberPer100: 2.2, tags: ['food_cat:fruits', 'meal_role:fruit', 'grams_max:250'] },
  { id: 'pear', label: 'Груша', group: 'carbs', proteinPer100: 0.4, fatPer100: 0.3, carbsPer100: 15, fiberPer100: 3, tags: ['food_cat:fruits', 'meal_role:fruit', 'grams_max:250'] },
  { id: 'kiwi', label: 'Киви', group: 'carbs', proteinPer100: 1, fatPer100: 0.5, carbsPer100: 14, fiberPer100: 3, tags: ['food_cat:fruits', 'meal_role:fruit', 'grams_max:200'] },
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
