/**
 * Разбор ответа Open Food Facts → hit дневника (без сети).
 */
import { foodDiaryHitFromProduct, normalizeFoodBarcode } from './foodDiaryCatalogCore.js'

/**
 * @param {object} product — product из OFF API
 * @param {string} barcode
 */
export function foodDiaryHitFromOpenFoodFacts(product, barcode) {
  const code = normalizeFoodBarcode(barcode)
  if (!code || !product || typeof product !== 'object') return null
  const name =
    String(product.product_name_ru || product.product_name || product.generic_name || '').trim() ||
    `Штрихкод ${code}`
  const n = product.nutriments || {}
  const proteinPer100 = Number(n['proteins_100g'] ?? n.proteins) || 0
  const fatPer100 = Number(n['fat_100g'] ?? n.fat) || 0
  const carbsPer100 = Number(n['carbohydrates_100g'] ?? n.carbohydrates) || 0
  const fiberPer100 = Number(n['fiber_100g'] ?? n.fiber) || 0
  const energyKcal = Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? n.energy_kcal)
  const hit = foodDiaryHitFromProduct(
    {
      id: `off:${code}`,
      label: name.slice(0, 120),
      proteinPer100,
      fatPer100,
      carbsPer100,
      fiberPer100,
    },
    'off',
  )
  if (!hit) return null
  if (Number.isFinite(energyKcal) && energyKcal > 0) {
    hit.kcal_per100 = Math.round(energyKcal * 10) / 10
  }
  hit.barcode = code
  const sugar = Number(n['sugars_100g'] ?? n.sugars)
  const sodium = Number(n['sodium_100g'] ?? n.sodium)
  if (Number.isFinite(sugar) && sugar >= 0) hit.sugar_per100 = Math.round(sugar * 10) / 10
  // OFF sodium_100g часто в г → мг
  if (Number.isFinite(sodium) && sodium >= 0) {
    hit.sodium_mg_per100 = sodium < 5 ? Math.round(sodium * 1000 * 10) / 10 : Math.round(sodium * 10) / 10
  }
  return hit
}

/**
 * @param {object} apiJson — полный JSON OFF
 */
export function parseOpenFoodFactsResponse(apiJson, barcode) {
  const status = Number(apiJson?.status)
  if (status !== 1 || !apiJson?.product) {
    return { ok: false, error: 'Продукт по штрихкоду не найден' }
  }
  const hit = foodDiaryHitFromOpenFoodFacts(apiJson.product, barcode)
  if (!hit) return { ok: false, error: 'Не удалось разобрать состав' }
  return { ok: true, hit }
}
