/**
 * Человеческое название тарелки по составу — не «Белок с картофелем», если в тарелке рис.
 */
import { resolveCatalogProduct } from './nutritionCatalogResolve.js'
import { getProductFoodCategory } from './nutritionFoodCategoriesCore.js'
import { getProductMealRole } from './nutritionMealPairingCore.js'

/** Роли гарнира / основы, из которых берём «с …». */
const SIDE_ROLES = new Set(['starchy', 'grain', 'fruit', 'salad'])

/** Именительный → творительный для «с …» (известные продукты). */
const SIDE_INSTRUMENTAL = {
  potato: 'картофелем',
  rice: 'рисом',
  buckwheat: 'гречкой',
  millet: 'пшеном',
  pearl_barley: 'перловкой',
  pasta: 'макаронами',
  pasta_whole: 'макаронами',
  oats: 'овсянкой',
  bread_whole: 'хлебом',
  bread_rye: 'хлебом',
  crispbread: 'хлебцами',
  lentils: 'чечевицей',
  chickpeas: 'нутом',
  vegetables: 'овощами',
  cucumber: 'огурцом',
  tomato: 'помидором',
  cabbage: 'капустой',
  broccoli: 'брокколи',
  zucchini: 'кабачком',
  apple: 'яблоком',
  banana: 'бананом',
  berries: 'ягодами',
  orange: 'апельсином',
  pear: 'грушей',
  kiwi: 'киви',
}

/**
 * Короткое имя продукта без «(варёный)» и т.п.
 * @param {string} label
 */
export function shortFoodLabel(label) {
  return String(label ?? '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * @param {string} productId
 * @param {import('./nutritionCatalogResolve.js').ResolvedNutritionProduct | null | undefined} product
 */
function sideInstrumental(productId, product) {
  const id = String(productId ?? '')
  if (SIDE_INSTRUMENTAL[id]) return SIDE_INSTRUMENTAL[id]
  const cat = getProductFoodCategory(product)
  if (cat === 'potato') return 'картофелем'
  if (cat === 'pasta') return 'макаронами'
  if (cat === 'bread') return 'хлебом'
  if (cat === 'vegetables') return 'овощами'
  if (cat === 'fruits') return 'фруктом'
  if (cat === 'grains') {
    const short = shortFoodLabel(product?.label).toLowerCase()
    if (short.includes('рис')) return 'рисом'
    if (short.includes('греч')) return 'гречкой'
    if (short.includes('овсян') || short.includes('овсянк')) return 'овсянкой'
  }
  const short = shortFoodLabel(product?.label).toLowerCase()
  return short || 'гарниром'
}

/**
 * @param {object[]} items
 * @param {Map<string, import('./nutritionCatalogResolve.js').ResolvedNutritionProduct>} catalogMap
 * @param {string} [fallback]
 * @returns {string}
 */
export function dishLabelFromItems(items, catalogMap, fallback = '') {
  if (!items?.length) return String(fallback ?? '').trim()
  let protein = null
  let side = null
  for (const it of items) {
    const p = resolveCatalogProduct(catalogMap, it.productId, { label: it.label })
    const role = getProductMealRole(it.productId, p)
    if (!protein && role === 'protein') protein = { it, p }
    else if (!side && SIDE_ROLES.has(role)) side = { it, p }
  }
  if (!protein || !side) return String(fallback ?? '').trim() || shortFoodLabel(protein?.it?.label ?? items[0]?.label)

  const proteinName = shortFoodLabel(protein.it.label ?? protein.p?.label)
  const withSide = sideInstrumental(side.it.productId, side.p)
  if (!proteinName || !withSide) return String(fallback ?? '').trim()
  return `${proteinName} с ${withSide}`
}
