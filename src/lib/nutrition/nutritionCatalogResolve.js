import { NUTRITION_PRODUCT_CATALOG } from './nutritionProductCatalog.js'
import { normalizeNutritionProductRow } from './nutritionProductsCore.js'

/**
 * @typedef {import('./nutritionProductCatalog.js').NutritionProduct & { source?: 'club' | 'builtin' }} ResolvedNutritionProduct
 */

function normalizeProductLabel(label) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Базовый справочник по нормализованному названию — для UUID клуба без meal_role. */
const BUILTIN_BY_LABEL = new Map(
  NUTRITION_PRODUCT_CATALOG.map((p) => [normalizeProductLabel(p.label), p]),
)

/**
 * У клубных строк часто UUID и неполные tags — без meal_role/suitable:* тарелки ломаются.
 * Дописываем недостающие теги из builtin по тому же названию (не затираем клубные).
 * @param {ResolvedNutritionProduct} product
 * @returns {ResolvedNutritionProduct}
 */
export function enrichProductTagsFromBuiltin(product) {
  if (!product) return product
  const builtin = BUILTIN_BY_LABEL.get(normalizeProductLabel(product.label))
  if (!builtin?.tags?.length) return product
  const own = product.tags ?? []
  const merged = [...own]
  let changed = false
  for (const t of builtin.tags) {
    if (!merged.includes(t)) {
      merged.push(t)
      changed = true
    }
  }
  if (!changed) return product
  return { ...product, tags: merged }
}

/**
 * @param {object} row — строка nutrition_products
 * @returns {ResolvedNutritionProduct | null}
 */
export function dbRowToCatalogProduct(row) {
  const n = normalizeNutritionProductRow(row)
  if (!n) return null
  return enrichProductTagsFromBuiltin({
    id: n.id,
    label: n.label,
    group: n.macro_group,
    proteinPer100: n.protein_per100,
    fatPer100: n.fat_per100,
    carbsPer100: n.carbs_per100,
    pieceGrams: n.piece_grams ?? undefined,
    fiberPer100: n.fiber_per100 != null ? Number(n.fiber_per100) : undefined,
    tags: n.tags?.length ? n.tags : undefined,
    source: 'club',
  })
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
 * Найти продукт в карте клуба, иначе по названию / встроенному справочнику.
 * Старые рационы могут хранить builtin-id, а в клубе уже UUID с тем же названием.
 * @param {Map<string, ResolvedNutritionProduct> | null | undefined} catalogMap
 * @param {string} id
 * @param {{ label?: string } | string} [optsOrLabel]
 */
export function resolveCatalogProduct(catalogMap, id, optsOrLabel) {
  const key = String(id ?? '').trim()
  if (key && catalogMap?.get) {
    const hit = catalogMap.get(key)
    if (hit) return hit
  }
  const labelRaw =
    typeof optsOrLabel === 'string' ? optsOrLabel : optsOrLabel && typeof optsOrLabel === 'object' ? optsOrLabel.label : ''
  const label = normalizeProductLabel(labelRaw)
  if (label && catalogMap?.values) {
    for (const p of catalogMap.values()) {
      if (normalizeProductLabel(p.label) === label) return p
    }
  }
  if (key) {
    const builtin = NUTRITION_PRODUCT_CATALOG.find((p) => p.id === key)
    if (builtin) return { ...builtin, source: 'builtin' }
  }
  if (label) {
    const builtin = BUILTIN_BY_LABEL.get(label)
    if (builtin) return { ...builtin, source: 'builtin' }
  }
  return null
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
