/** @typedef {'fruit' | 'salad' | 'starchy' | 'grain' | 'spread_dairy_fat' | 'oil_fat' | 'nut_fat' | 'protein' | 'other'} MealFoodRole */

/** @typedef {'fruit' | 'salad' | 'starchy' | 'grain'} PairWithRole */

export const NUTRITION_EXCLUSION_TAG_IDS = ['lactose', 'gluten']

/** @type {readonly MealFoodRole[]} */
export const VALID_MEAL_ROLES = [
  'fruit',
  'salad',
  'starchy',
  'grain',
  'spread_dairy_fat',
  'oil_fat',
  'nut_fat',
  'protein',
  'other',
]

/** @type {readonly PairWithRole[]} */
export const VALID_PAIR_TARGETS = ['fruit', 'salad', 'starchy', 'grain']

export const MEAL_ROLE_OPTIONS = [
  { id: 'fruit', label: 'Фрукт' },
  { id: 'salad', label: 'Салат / овощи' },
  { id: 'starchy', label: 'Крахмалистые' },
  { id: 'grain', label: 'Крупы / хлеб' },
  { id: 'spread_dairy_fat', label: 'Сливочный жир (масло, сметана)' },
  { id: 'oil_fat', label: 'Растительное масло' },
  { id: 'nut_fat', label: 'Орехи / авокадо / паста' },
  { id: 'protein', label: 'Белковый продукт' },
  { id: 'other', label: 'Другое' },
]

export const PAIRS_WITH_OPTIONS = [
  { id: 'fruit', label: 'Фрукты' },
  { id: 'salad', label: 'Салат' },
  { id: 'starchy', label: 'Крахмалистые' },
  { id: 'grain', label: 'Крупы / хлеб' },
]

const MEAL_ROLE_LABEL = Object.fromEntries(MEAL_ROLE_OPTIONS.map((o) => [o.id, o.label]))
const PAIRS_LABEL = Object.fromEntries(PAIRS_WITH_OPTIONS.map((o) => [o.id, o.label]))

const PAIRING_TAG_PREFIXES = ['meal_role:', 'pairs:', 'grams_min:', 'grams_max:']

/** @param {string} tag */
export function isPairingMetaTag(tag) {
  const t = String(tag ?? '')
  return PAIRING_TAG_PREFIXES.some((p) => t.startsWith(p))
}

/**
 * @param {string[] | undefined} tags
 * @returns {MealFoodRole | null}
 */
export function parseMealRoleFromTags(tags) {
  for (const t of tags ?? []) {
    const m = String(t).match(/^meal_role:(.+)$/)
    if (m && VALID_MEAL_ROLES.includes(/** @type {MealFoodRole} */ (m[1]))) {
      return /** @type {MealFoodRole} */ (m[1])
    }
  }
  return null
}

/**
 * @param {string[] | undefined} tags
 * @returns {PairWithRole[]}
 */
export function parsePairsWithFromTags(tags) {
  return (tags ?? [])
    .map((t) => String(t))
    .filter((t) => t.startsWith('pairs:'))
    .map((t) => t.slice(6))
    .filter((r) => VALID_PAIR_TARGETS.includes(/** @type {PairWithRole} */ (r)))
}

/**
 * @param {string[] | undefined} tags
 * @returns {{ min?: number, max?: number }}
 */
export function parseGramLimitsFromTags(tags) {
  let min
  let max
  for (const t of tags ?? []) {
    const s = String(t)
    const minM = s.match(/^grams_min:(\d+)$/)
    const maxM = s.match(/^grams_max:(\d+)$/)
    if (minM) min = Number(minM[1])
    if (maxM) max = Number(maxM[1])
  }
  return { min, max }
}

/**
 * @param {string[] | undefined} tags
 * @returns {string[]}
 */
export function parseExclusionTags(tags) {
  const ex = new Set(NUTRITION_EXCLUSION_TAG_IDS)
  return (tags ?? []).map(String).filter((t) => ex.has(t))
}

/**
 * @param {{
 *   mealRole?: string | null,
 *   pairsWith?: string[],
 *   exclusions?: string[],
 *   gramsMin?: number | null,
 *   gramsMax?: number | null,
 * }} input
 * @returns {string[]}
 */
export function buildProductTags(input) {
  const tags = []
  const role = String(input.mealRole ?? '').trim()
  if (role && VALID_MEAL_ROLES.includes(/** @type {MealFoodRole} */ (role))) {
    tags.push(`meal_role:${role}`)
  }
  for (const p of input.pairsWith ?? []) {
    const id = String(p).trim()
    if (VALID_PAIR_TARGETS.includes(/** @type {PairWithRole} */ (id))) tags.push(`pairs:${id}`)
  }
  for (const e of input.exclusions ?? []) {
    const id = String(e).trim()
    if (NUTRITION_EXCLUSION_TAG_IDS.includes(id)) tags.push(id)
  }
  const gmin = input.gramsMin != null ? Number(input.gramsMin) : null
  const gmax = input.gramsMax != null ? Number(input.gramsMax) : null
  if (Number.isFinite(gmin) && gmin > 0) tags.push(`grams_min:${Math.round(gmin)}`)
  if (Number.isFinite(gmax) && gmax > 0) tags.push(`grams_max:${Math.round(gmax)}`)
  return tags
}

/** @param {'protein' | 'fat' | 'carbs' | string} macroGroup */
export function defaultMealRoleForMacroGroup(macroGroup) {
  if (macroGroup === 'protein') return 'protein'
  if (macroGroup === 'fat') return 'oil_fat'
  if (macroGroup === 'carbs') return 'starchy'
  return 'other'
}

/**
 * Человекочитаемые подписи для списка продуктов.
 * @param {string[] | undefined} tags
 */
export function formatPairingTagsForDisplay(tags) {
  const role = parseMealRoleFromTags(tags)
  const pairs = parsePairsWithFromTags(tags)
  const limits = parseGramLimitsFromTags(tags)
  const exclusions = parseExclusionTags(tags)
  const chips = []
  if (role) chips.push({ kind: 'role', text: MEAL_ROLE_LABEL[role] ?? role })
  for (const p of pairs) chips.push({ kind: 'pairs', text: `+ ${PAIRS_LABEL[p] ?? p}` })
  if (limits.min != null) chips.push({ kind: 'limit', text: `мин ${limits.min} г` })
  if (limits.max != null) chips.push({ kind: 'limit', text: `макс ${limits.max} г` })
  for (const e of exclusions) {
    chips.push({ kind: 'exclusion', text: e === 'lactose' ? 'лактоза' : e === 'gluten' ? 'глютен' : e })
  }
  return chips
}
