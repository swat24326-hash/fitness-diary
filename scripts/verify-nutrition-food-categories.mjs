import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { NUTRITION_PRODUCT_CATALOG } from '../src/lib/nutrition/nutritionProductCatalog.js'
import {
  NUTRITION_FOOD_CATEGORIES,
  foodCategoryAvoidStats,
  getProductFoodCategory,
  listCatalogProductsByFoodCategory,
  listProductsMissingFoodCategory,
  setCategoryAvoided,
} from '../src/lib/nutrition/nutritionFoodCategoriesCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalog = buildNutritionCatalogMap([])
ok(listProductsMissingFoodCategory(catalog).length === 0, 'all builtin products have food_cat')
ok(NUTRITION_FOOD_CATEGORIES.length >= 8, 'enough food categories')

for (const cat of NUTRITION_FOOD_CATEGORIES) {
  const list = listCatalogProductsByFoodCategory(catalog, cat.id)
  ok(list.length > 0, `${cat.id} has products (${list.length})`)
}

ok(getProductFoodCategory(catalog.get('cottage_cheese_5')) === 'dairy', 'cottage → dairy')
ok(getProductFoodCategory(catalog.get('fish_white')) === 'seafood', 'fish → seafood')
ok(getProductFoodCategory(catalog.get('potato')) === 'potato', 'potato → potato shelf')
ok(getProductFoodCategory(catalog.get('pasta')) === 'pasta', 'pasta → pasta shelf')
ok(getProductFoodCategory(catalog.get('oats')) === 'grains', 'oats → grains')
ok(getProductFoodCategory(catalog.get('butter')) === 'dairy', 'butter → dairy')
ok(NUTRITION_PRODUCT_CATALOG.length >= 50, `catalog size ${NUTRITION_PRODUCT_CATALOG.length} >= 50`)
ok(NUTRITION_PRODUCT_CATALOG.every((p) => p.fiberPer100 != null), 'all products have fiberPer100')

const dairyStats = foodCategoryAvoidStats({
  categoryId: 'dairy',
  avoidProductIds: [],
  exclusions: [],
  catalogMap: catalog,
})
ok(dairyStats.toggleableIds.length >= 5, 'dairy toggleable')
const allDairyAvoid = setCategoryAvoided([], dairyStats.toggleableIds, true)
ok(allDairyAvoid.length === dairyStats.toggleableIds.length, 'avoid all dairy')
const cleared = setCategoryAvoided(allDairyAvoid, dairyStats.toggleableIds, false)
ok(cleared.length === 0, 'restore all dairy')

ok(NUTRITION_PRODUCT_CATALOG.every((p) => p.tags?.some((t) => String(t).startsWith('food_cat:'))), 'catalog tags food_cat')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition food-category checks passed')
