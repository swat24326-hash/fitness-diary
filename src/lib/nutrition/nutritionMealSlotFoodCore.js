/**
 * Предпочтения продуктов по типу приёма пищи (завтрак ≠ обед/ужин).
 */
import { resolveCatalogProduct } from './nutritionCatalogResolve.js'

/**
 * @param {string[] | undefined} tags
 * @returns {string[]}
 */
export function parseSuitableSlotsFromTags(tags) {
  const out = []
  for (const t of tags ?? []) {
    const m = String(t).match(/^suitable:(.+)$/)
    if (m?.[1]) out.push(m[1])
  }
  return out
}

/**
 * @param {'breakfast'|'lunch'|'dinner'|'snack'} slotKind
 * @returns {'breakfast'|'main'}
 */
export function suitableTagForSlotKind(slotKind) {
  if (slotKind === 'lunch' || slotKind === 'dinner') return 'main'
  return 'breakfast'
}

/**
 * Сужаем пул белка под слот; если подходящих нет — оставляем весь пул.
 * @param {string[]} proteinPool
 * @param {'breakfast'|'lunch'|'dinner'|'snack'} slotKind
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 */
export function preferProteinsForSlotKind(proteinPool, slotKind, catalogMap) {
  const want = suitableTagForSlotKind(slotKind)
  const matched = (proteinPool ?? []).filter((id) => {
    const p = resolveCatalogProduct(catalogMap, id)
    return parseSuitableSlotsFromTags(p?.tags).includes(want)
  })
  return matched.length ? matched : proteinPool ?? []
}
