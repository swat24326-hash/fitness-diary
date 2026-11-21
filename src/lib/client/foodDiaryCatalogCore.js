/**
 * Поиск продуктов для дневника: встроенная полка + строки клуба.
 * FoodBase / штрихкод OFF — отдельно на сервере.
 */
import { NUTRITION_PRODUCT_CATALOG } from '../nutrition/nutritionProductCatalog.js'
import { scaleMacrosFromPer100 } from './foodDiaryDayCore.js'

function round1(n) {
  return Math.round(Number(n) * 10) / 10
}

export function kcalPer100FromMacros({ proteinPer100 = 0, fatPer100 = 0, carbsPer100 = 0 }) {
  return round1(Number(proteinPer100) * 4 + Number(fatPer100) * 9 + Number(carbsPer100) * 4)
}

/** Нормализация штрихкода: только цифры, 8–14 знаков. */
export function normalizeFoodBarcode(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 14) return null
  return digits
}

/**
 * @param {object} p — NutritionProduct или row клуба
 * @param {'builtin'|'club'|'off'} source
 */
export function foodDiaryHitFromProduct(p, source = 'builtin') {
  const proteinPer100 = Number(p.proteinPer100 ?? p.protein_per100) || 0
  const fatPer100 = Number(p.fatPer100 ?? p.fat_per100) || 0
  const carbsPer100 = Number(p.carbsPer100 ?? p.carbs_per100) || 0
  const fiberPer100 = Number(p.fiberPer100 ?? p.fiber_per100) || 0
  const id = String(p.id ?? '')
  const name = String(p.label ?? p.name ?? '').trim()
  if (!name) return null
  return {
    id: id || `name:${name.toLowerCase()}`,
    name,
    source,
    protein_per100: proteinPer100,
    fat_per100: fatPer100,
    carbs_per100: carbsPer100,
    fiber_per100: fiberPer100,
    kcal_per100: kcalPer100FromMacros({ proteinPer100, fatPer100, carbsPer100 }),
    piece_grams: p.pieceGrams ?? p.piece_grams ?? null,
  }
}

/** Порция из hit + граммы → поля upsert. */
export function foodDiaryPortionFromHit(hit, grams) {
  const g = Number(grams)
  if (!Number.isFinite(g) || g <= 0) return null
  const macros = scaleMacrosFromPer100(
    {
      kcal: hit.kcal_per100,
      protein_g: hit.protein_per100,
      fat_g: hit.fat_per100,
      carbs_g: hit.carbs_per100,
      fiber_g: hit.fiber_per100,
      sugar_g: hit.sugar_per100,
      sodium_mg: hit.sodium_mg_per100,
    },
    g,
  )
  return {
    name: hit.name,
    grams: round1(g),
    catalog_id: hit.id,
    kcal: macros.kcal,
    protein_g: macros.protein_g,
    fat_g: macros.fat_g,
    carbs_g: macros.carbs_g,
    fiber_g: macros.fiber_g ?? 0,
    sugar_g: macros.sugar_g ?? 0,
    sodium_mg: macros.sodium_mg ?? 0,
  }
}

function normQuery(q) {
  return String(q ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Поиск по встроенному каталогу (клиент, без сети).
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 */
export function searchBuiltinFoodDiaryCatalog(query, opts = {}) {
  const q = normQuery(query)
  const limit = Math.min(40, Math.max(1, Number(opts.limit) || 20))
  if (q.length < 1) return []
  const hits = []
  for (const p of NUTRITION_PRODUCT_CATALOG) {
    const label = String(p.label ?? '').toLowerCase()
    if (!label.includes(q)) continue
    const hit = foodDiaryHitFromProduct(p, 'builtin')
    if (hit) hits.push(hit)
    if (hits.length >= limit) break
  }
  return hits
}

/**
 * Поиск по строкам клуба (уже загружены).
 * @param {object[]} rows nutrition_products
 * @param {string} query
 */
export function searchClubFoodDiaryRows(rows, query, opts = {}) {
  const q = normQuery(query)
  const limit = Math.min(40, Math.max(1, Number(opts.limit) || 20))
  if (q.length < 1) return []
  const hits = []
  for (const r of rows ?? []) {
    if (r.is_active === false) continue
    const label = String(r.label ?? '').toLowerCase()
    if (!label.includes(q)) continue
    const hit = foodDiaryHitFromProduct(r, 'club')
    if (hit) hits.push(hit)
    if (hits.length >= limit) break
  }
  return hits
}

/** Склейка: клуб сверху, потом встроенные; без дублей имени. */
export function mergeFoodDiarySearchHits(clubHits, builtinHits, limit = 24) {
  const seen = new Set()
  const out = []
  for (const h of [...(clubHits ?? []), ...(builtinHits ?? [])]) {
    const key = String(h.name).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(h)
    if (out.length >= limit) break
  }
  return out
}
