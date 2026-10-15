/**
 * Шаблоны тарелок: сначала блюдо, КБЖУ — следствие порций.
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
    id: 'protein_starch_salad',
    label: 'Белок с гарниром и салатом',
    slotKinds: ['breakfast', 'lunch', 'dinner'],
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
    id: 'oats_eggs',
    label: 'Каша с белком',
    slotKinds: ['breakfast'],
    parts: [
      { role: 'grain', share: 0.4 },
      { role: 'protein', share: 0.45 },
      { role: 'nut_fat', share: 0.15, optional: true },
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
    id: 'fruit_nuts',
    label: 'Фрукт с орехами',
    slotKinds: ['snack'],
    parts: [
      { role: 'fruit', share: 0.7 },
      { role: 'nut_fat', share: 0.3 },
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
 * Шаблоны, подходящие слоту, в стабильном порядке.
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
