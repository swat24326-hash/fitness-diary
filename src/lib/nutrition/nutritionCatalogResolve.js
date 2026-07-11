import { NUTRITION_PRODUCT_CATALOG } from './nutritionProductCatalog.js'
import { normalizeNutritionProductRow } from './nutritionProductsCore.js'

/**
 * @typedef {import('./nutritionProductCatalog.js').NutritionProduct & { source?: 'club' | 'builtin' }} ResolvedNutritionProduct
 */

/**
 * @param {object} row — строка nutrition_products
 * @returns {ResolvedNutritionProduct | null}
 */
export function dbRowToCatalogProduct(row) {
  const n = normalizeNutritionProductRow(row)
  if (!n) return null
  return {
    id: n.id,
    label: n.label,
    group: n.macro_group,
    proteinPer100: n.protein_per100,
    fatPer100: n.fat_per100,
    carbsPer100: n.carbs_per100,
    pieceGrams: n.piece_grams ?? undefined,
    tags: n.tags?.length ? n.tags : undefined,
    source: 'club',
  }
}

/**
 * @param {object[]} [clubRows]
 * @returns {Map<string, ResolvedNutritionProduct>}
 */
export function buildNutritionCatalogMap(clubRows) {
  const active = (clubRows ?? []).filter((r) => r && r.is_active !== false && normalizeNutritionProductRow(r))
  if (!active.length) {
    return new Map(NUTRITION_PRODUCT_CATALOG.map((p) => [p.id, { ...p, source: 'builtin' }]))
  }
  const map = new Map()
  for (const row of active) {
    const p = dbRowToCatalogProduct(row)
    if (p) map.set(p.id, p)
  }
  return map
}

/**
 * @param {Map<string, ResolvedNutritionProduct>} catalogMap
 * @param {import('./nutritionProductCatalog.js').NutritionMacroGroup} group
 */
export function listCatalogProductsByGroup(catalogMap, group) {
  return [...catalogMap.values()].filter((p) => p.group === group).sort((a, b) => a.label.localeCompare(b.label, 'ru'))
}

/**
 * @param {Map<string, ResolvedNutritionProduct>} catalogMap
 * @param {string} id
 */
export function resolveCatalogProduct(catalogMap, id) {
  return catalogMap.get(id) ?? null
}

/**
 * @param {string[]} productIds
 * @param {string[]} exclusions
 * @param {Map<string, ResolvedNutritionProduct>} catalogMap
 */
export function filterCatalogProductsByExclusions(productIds, exclusions, catalogMap) {
  const ex = new Set((exclusions ?? []).map((x) => String(x)))
  return productIds.filter((id) => {
    const p = resolveCatalogProduct(catalogMap, id)
    if (!p?.tags?.length) return true
    return !p.tags.some((t) => ex.has(t))
  })
}

export function catalogSourceLabel(catalogMap) {
  const first = catalogMap.values().next().value
  return first?.source === 'club' ? 'Набор клуба' : 'Базовый справочник'
}
