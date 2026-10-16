/**
 * Шаблоны тарелок: сначала блюдо, КБЖУ — следствие порций.
 * Завтрак: белок + клетчатка (каша/овощи/фрукт) + жир — без «обеденного» мяса с картошкой.
 * Обед/ужин: белок с гарниром / овощами.
 * @typedef {'protein' | 'fruit' | 'salad' | 'starchy' | 'grain' | 'spread_dairy_fat' | 'oil_fat' | 'nut_fat'} DishPartRole
 *
 * @typedef {object} DishPart
 * @property {DishPartRole} role
 * @property {number} share доля ккал внутри блюда (сумма частей ≈ 1)
 * @property {boolean} [optional] нет кандидата — часть пропускаем
 *
 * @typedef {object} DishTemplate
 * @property {string} id
 * @property {string} label
 * @property {string[]} slotKinds breakfast|lunch|dinner|snack
 * @property {DishPart[]} parts
 */

/** @type {DishTemplate[]} */
export const NUTRITION_DISH_TEMPLATES = [
  {
    id: 'oats_eggs',
    label: 'Каша с белком',
    slotKinds: ['breakfast'],
    parts: [
      { role: 'grain', share: 0.35 },
      { role: 'protein', share: 0.45 },
      { role: 'nut_fat', share: 0.1, optional: true },
      { role: 'fruit', share: 0.1, optional: true },
    ],
  },
  {
    id: 'cottage_fruit',
    label: 'Творог / йогурт с фруктами',
    slotKinds: ['breakfast', 'snack'],
    parts: [
      { role: 'protein', share: 0.55 },
      { role: 'fruit', share: 0.35 },
      { role: 'nut_fat', share: 0.1, optional: true },
    ],
  },
  {
    id: 'eggs_veg',
    label: 'Яйца / белок с овощами',
    slotKinds: ['breakfast'],
    parts: [
      { role: 'protein', share: 0.5 },
      { role: 'salad', share: 0.25 },
      { role: 'grain', share: 0.15, optional: true },
      { role: 'oil_fat', share: 0.1, optional: true },
    ],
  },
  {
    id: 'eggs_toast',
    label: 'Белок с хлебом',
    slotKinds: ['breakfast'],
    parts: [
      { role: 'protein', share: 0.45 },
      { role: 'grain', share: 0.35 },
      { role: 'spread_dairy_fat', share: 0.1, optional: true },
      { role: 'salad', share: 0.1, optional: true },
    ],
  },
  {
    id: 'fruit_nuts',
    label: 'Фрукт с орехами',
    slotKinds: ['snack'],
    parts: [
      { role: 'fruit', share: 0.7 },
      { role: 'nut_fat', share: 0.3 },
    ],
  },
  {
    id: 'protein_carb_snack',
    label: 'Белок с углеводом',
    slotKinds: ['snack'],
    parts: [
      { role: 'protein', share: 0.5 },
      { role: 'starchy', share: 0.4 },
      { role: 'oil_fat', share: 0.1, optional: true },
    ],
  },
  {
    id: 'protein_starch_salad',
    label: 'Белок с гарниром и салатом',
    slotKinds: ['lunch', 'dinner'],
    parts: [
      { role: 'protein', share: 0.35 },
      { role: 'starchy', share: 0.35 },
      { role: 'salad', share: 0.2, optional: true },
      { role: 'oil_fat', share: 0.1 },
    ],
  },
  {
    id: 'protein_salad',
    label: 'Белок с овощами',
    slotKinds: ['lunch', 'dinner'],
    parts: [
      { role: 'protein', share: 0.5 },
      { role: 'salad', share: 0.35 },
      { role: 'oil_fat', share: 0.15 },
    ],
  },
  {
    id: 'protein_potato',
    label: 'Белок с картофелем',
    slotKinds: ['lunch', 'dinner'],
    parts: [
      { role: 'protein', share: 0.4 },
      { role: 'starchy', share: 0.4 },
      { role: 'spread_dairy_fat', share: 0.1, optional: true },
      { role: 'salad', share: 0.1, optional: true },
    ],
  },
]

/**
 * @param {string} slotId
 * @returns {'breakfast'|'lunch'|'dinner'|'snack'}
 */
export function slotKindFromId(slotId) {
  const id = String(slotId ?? '')
  if (id === 'breakfast') return 'breakfast'
  if (id === 'lunch') return 'lunch'
  if (id === 'dinner') return 'dinner'
  return 'snack'
}

/**
 * Шаблоны, подходящие слоту, в стабильном порядке (сначала типичные для слота).
 * @param {string} slotId
 * @returns {DishTemplate[]}
 */
export function templatesForSlot(slotId) {
  const kind = slotKindFromId(slotId)
  return NUTRITION_DISH_TEMPLATES.filter((t) => t.slotKinds.includes(kind))
}

/**
 * @param {string} slotId
 * @param {number} mealIndex
 * @param {DishTemplate[]} [pool]
 */
export function pickDishTemplate(slotId, mealIndex, pool) {
  const list = pool?.length ? pool : templatesForSlot(slotId)
  if (!list.length) return NUTRITION_DISH_TEMPLATES[0]
  return list[Math.abs(mealIndex) % list.length]
}
