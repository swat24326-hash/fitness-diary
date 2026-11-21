/**
 * Поиск каталога дневника + порция + OFF barcode parse.
 * node scripts/verify-food-diary-catalog.mjs
 */
import {
  foodDiaryPortionFromHit,
  kcalPer100FromMacros,
  mergeFoodDiarySearchHits,
  normalizeFoodBarcode,
  searchBuiltinFoodDiaryCatalog,
  searchClubFoodDiaryRows,
} from '../src/lib/client/foodDiaryCatalogCore.js'
import { parseOpenFoodFactsResponse } from '../src/lib/client/foodDiaryOffBarcodeCore.js'
import {
  FOOD_BARCODE_SCAN_FORMATS,
  foodBarcodeScanSupported,
} from '../src/lib/client/foodDiaryBarcodeScanCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('OK:', msg)
}

ok(normalizeFoodBarcode('4600605') === null, 'короткий штрихкод')
ok(normalizeFoodBarcode('4600605021487') === '4600605021487', 'EAN-13')
ok(normalizeFoodBarcode('46 0060-5021487') === '4600605021487', 'цифры из мусора')
ok(FOOD_BARCODE_SCAN_FORMATS.includes('ean_13'), 'форматы скана')
ok(foodBarcodeScanSupported({}) === false, 'без BarcodeDetector — нет скана')
ok(foodBarcodeScanSupported({ BarcodeDetector: function BarcodeDetector() {} }) === true, 'с BarcodeDetector')

ok(kcalPer100FromMacros({ proteinPer100: 10, fatPer100: 0, carbsPer100: 0 }) === 40, 'ккал из белка')

const hits = searchBuiltinFoodDiaryCatalog('курин', { limit: 5 })
ok(hits.length >= 1 && hits[0].name.toLowerCase().includes('курин'), 'поиск встроенной полки')

const club = searchClubFoodDiaryRows(
  [{ id: 'c1', label: 'Творог клубный', protein_per100: 16, fat_per100: 5, carbs_per100: 3, is_active: true }],
  'твор',
)
ok(club.length === 1 && club[0].source === 'club', 'поиск клуба')

const merged = mergeFoodDiarySearchHits(club, hits, 10)
ok(merged[0].source === 'club', 'клуб сверху')

const portion = foodDiaryPortionFromHit(hits[0], 50)
ok(portion && portion.grams === 50 && portion.kcal > 0, 'порция 50 г')

const off = parseOpenFoodFactsResponse(
  {
    status: 1,
    product: {
      product_name_ru: 'Йогурт',
      nutriments: {
        'energy-kcal_100g': 80,
        proteins_100g: 4,
        fat_100g: 2,
        carbohydrates_100g: 10,
        sugars_100g: 8,
        sodium_100g: 0.05,
      },
    },
  },
  '4600605021487',
)
ok(off.ok && off.hit.name === 'Йогурт' && off.hit.kcal_per100 === 80, 'OFF hit')
ok(parseOpenFoodFactsResponse({ status: 0 }, '4600605021487').ok === false, 'OFF не найден')

console.log('verify-food-diary-catalog: OK')
