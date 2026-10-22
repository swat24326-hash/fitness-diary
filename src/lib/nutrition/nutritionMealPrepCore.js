/**
 * Режим приёма: «база» (рис/курица/творог) vs «рецепт» (готовить по шагам).
 * В дне из 4 приёмов — ровно 2 рецепта, остальное база (как у нормального тренера, не как у болтливой нейронки).
 */

/** @typedef {'base' | 'recipe'} NutritionMealPrep */

/** Именные блюда, где реально есть «готовка», не просто смешать/отварить. */
const RECIPE_PREP_IDS = new Set([
  'oat_blini_cottage',
  'oat_blini_savory_fish',
  'syrniki_pp',
  'egg_bread_toast',
  'chicken_cottage_pate',
  'whey_oats_berries',
  'cheese_toast_egg',
  'caesar_pp',
  'chicken_egg_yogurt_salad',
  'chicken_potato_salad',
  'fish_potato_salad',
  'beef_buckwheat_veg',
  'turkey_pasta_salad',
  'rice_egg_veg',
])

/**
 * @param {{ id?: string, prep?: string } | null | undefined} recipe
 * @returns {NutritionMealPrep}
 */
export function getRecipePrep(recipe) {
  if (recipe?.prep === 'recipe' || recipe?.prep === 'base') return recipe.prep
  if (recipe?.id && RECIPE_PREP_IDS.has(String(recipe.id))) return 'recipe'
  return 'base'
}

/**
 * Сколько рецептов в дне при N приёмах.
 * @param {number} mealsPerDay
 */
export function recipeSlotsPerDay(mealsPerDay) {
  const n = Number(mealsPerDay) || 4
  if (n <= 2) return 1
  if (n === 3) return 1
  return 2
}

/**
 * Маска prep на день. Ротация по dayIndex, чтобы дни недели не клонировали друг друга.
 * @param {number} mealsPerDay
 * @param {number} [dayIndex]
 * @returns {NutritionMealPrep[]}
 */
export function mealPrepModesForDay(mealsPerDay, dayIndex = 0) {
  const n = Math.max(2, Math.min(6, Number(mealsPerDay) || 4))
  const recipeCount = recipeSlotsPerDay(n)
  /** @type {NutritionMealPrep[]} */
  const modes = Array.from({ length: n }, () => 'base')
  const rot = Math.abs(Number(dayIndex) || 0) % 3

  /** Индексы слотов под рецепт (0 = завтрак). */
  let recipeIdx = []
  if (n === 2) {
    recipeIdx = rot === 1 ? [1] : [0]
  } else if (n === 3) {
    recipeIdx = rot === 0 ? [0] : rot === 1 ? [1] : [2]
  } else if (n === 4) {
    // Как в хорошем примере: 2 рецепта, 2 базы
    if (rot === 0) recipeIdx = [0, 2] // завтрак + перекус
    else if (rot === 1) recipeIdx = [0, 1] // завтрак + обед
    else recipeIdx = [1, 3] // обед + ужин
  } else if (n === 5) {
    if (rot === 0) recipeIdx = [0, 2]
    else if (rot === 1) recipeIdx = [1, 3]
    else recipeIdx = [0, 4]
  } else {
    // 6 приёмов — всё равно только 2 рецепта
    if (rot === 0) recipeIdx = [0, 3]
    else if (rot === 1) recipeIdx = [1, 4]
    else recipeIdx = [2, 5]
  }

  for (const i of recipeIdx.slice(0, recipeCount)) {
    if (i >= 0 && i < n) modes[i] = 'recipe'
  }
  return modes
}

/**
 * @param {NutritionMealPrep[]} modes
 */
export function countPrepInModes(modes) {
  let recipe = 0
  let base = 0
  for (const m of modes ?? []) {
    if (m === 'recipe') recipe++
    else base++
  }
  return { recipe, base }
}
