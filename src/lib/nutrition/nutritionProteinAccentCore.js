/**
 * Акцент белка на период (курица / рыба / …) — prefs клиента, не жёсткий фильтр «только это».
 */

/** @typedef {'mixed'|'chicken'|'turkey'|'beef'|'fish'|'dairy'} NutritionProteinAccent */

export const NUTRITION_PROTEIN_ACCENT_OPTIONS = [
  { id: 'mixed', label: 'Смешанный', hint: 'как обычно, без упора' },
  { id: 'chicken', label: 'Курица', hint: 'неделя с курицей' },
  { id: 'turkey', label: 'Индейка', hint: 'упор на индейку' },
  { id: 'beef', label: 'Говядина', hint: 'постная говядина' },
  { id: 'fish', label: 'Рыба', hint: 'белая рыба / лосось' },
  { id: 'dairy', label: 'Молочка', hint: 'творог, йогурт, яйца' },
]

const VALID = new Set(NUTRITION_PROTEIN_ACCENT_OPTIONS.map((o) => o.id))

/** Предпочтительные id продуктов для акцента (builtin + совпадение по label через pool). */
const ACCENT_PRODUCT_KEYS = {
  chicken: ['chicken_breast'],
  turkey: ['turkey_breast', 'minced_turkey'],
  beef: ['beef_lean'],
  fish: ['fish_white', 'pollock', 'salmon', 'tuna_canned'],
  dairy: [
    'cottage_cheese_5',
    'cottage_cheese_0',
    'yogurt',
    'yogurt_greek',
    'kefir',
    'eggs',
    'protein_drink_hp',
    'cheese_light',
  ],
}

/**
 * @param {unknown} raw
 * @returns {NutritionProteinAccent}
 */
export function normalizeProteinAccent(raw) {
  const id = String(raw ?? '').trim()
  return VALID.has(/** @type {NutritionProteinAccent} */ (id)) ? /** @type {NutritionProteinAccent} */ (id) : 'mixed'
}

/**
 * Переупорядочить пул белка: предпочитаемые id сначала, остальные следом.
 * @param {string[]} proteinIds
 * @param {NutritionProteinAccent | string} accent
 * @returns {string[]}
 */
export function orderProteinIdsByAccent(proteinIds, accent) {
  const a = normalizeProteinAccent(accent)
  if (a === 'mixed' || !proteinIds?.length) return [...(proteinIds ?? [])]
  const prefer = new Set(ACCENT_PRODUCT_KEYS[a] ?? [])
  const preferred = []
  const rest = []
  for (const id of proteinIds) {
    if (prefer.has(id)) preferred.push(id)
    else rest.push(id)
  }
  // Если в пуле нет точных builtin id — ищем по суффиксу/подстроке ключа.
  if (!preferred.length) {
    const keys = ACCENT_PRODUCT_KEYS[a] ?? []
    for (const id of proteinIds) {
      const hit = keys.some((k) => id === k || String(id).includes(k.split('_')[0]))
      if (hit) preferred.push(id)
      else rest.push(id)
    }
    return preferred.length ? [...preferred, ...rest.filter((x) => !preferred.includes(x))] : [...proteinIds]
  }
  return [...preferred, ...rest]
}

/**
 * Календарный акцент: чередование по неделям от якоря (фаза 5).
 * @param {NutritionProteinAccent[]} sequence — например ['chicken','fish','turkey']
 * @param {string} anchorIso — YYYY-MM-DD
 * @param {string} todayIso
 */
export function proteinAccentForWeek(sequence, anchorIso, todayIso) {
  const seq = (sequence ?? []).map(normalizeProteinAccent).filter((x) => x !== 'mixed')
  if (!seq.length) return 'mixed'
  const a = Date.parse(`${anchorIso}T00:00:00Z`)
  const t = Date.parse(`${todayIso}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(t)) return seq[0]
  const week = Math.max(0, Math.floor((t - a) / (7 * 86_400_000)))
  return seq[week % seq.length]
}

/**
 * Рецепт «про акцент», если среди обязательных ингредиентов есть продукт акцента.
 * @param {{ parts?: { productKey: string, optional?: boolean }[] }} recipe
 * @param {NutritionProteinAccent | string} accent
 */
export function recipeMatchesAccent(recipe, accent) {
  const a = normalizeProteinAccent(accent)
  if (a === 'mixed') return true
  const keys = ACCENT_PRODUCT_KEYS[a] ?? []
  if (!keys.length) return true
  const keySet = new Set(keys)
  for (const part of recipe?.parts ?? []) {
    if (part.optional) continue
    const k = String(part.productKey ?? '')
    if (keySet.has(k)) return true
    if (a === 'chicken' && k.includes('chicken')) return true
    if (a === 'fish' && (k.includes('fish') || k.includes('pollock') || k.includes('salmon') || k.includes('tuna'))) {
      return true
    }
    if (a === 'turkey' && k.includes('turkey')) return true
    if (a === 'beef' && k.includes('beef')) return true
  }
  return false
}

/**
 * Сначала рецепты под акцент, остальные следом (для обеда/ужина).
 * @template {{ parts?: { productKey: string, optional?: boolean }[] }} T
 * @param {T[]} recipes
 * @param {NutritionProteinAccent | string} accent
 * @returns {T[]}
 */
export function orderRecipesByAccent(recipes, accent) {
  const a = normalizeProteinAccent(accent)
  if (a === 'mixed' || !recipes?.length) return [...(recipes ?? [])]
  const preferred = []
  const rest = []
  for (const r of recipes) {
    if (recipeMatchesAccent(r, a)) preferred.push(r)
    else rest.push(r)
  }
  return preferred.length ? [...preferred, ...rest] : [...recipes]
}
