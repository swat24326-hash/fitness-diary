import {
  pickFatProductId,
  pickProteinProductId,
  areProductsCompatibleInMeal,
  clampProductGrams,
  getProductMealRole,
} from '../src/lib/nutrition/nutritionMealPairingCore.js'
import { buildNutritionCatalogMap } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import {
  buildProductTags,
  parseMealRoleFromTags,
  parsePairsWithFromTags,
} from '../src/lib/nutrition/nutritionProductPairingTags.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalogMap = buildNutritionCatalogMap([])

ok(!areProductsCompatibleInMeal('butter', 'banana', catalogMap), 'butter + banana incompatible')
ok(!areProductsCompatibleInMeal('butter', 'vegetables', catalogMap), 'butter + salad incompatible')
ok(areProductsCompatibleInMeal('butter', 'potato', catalogMap), 'butter + potato ok')
ok(areProductsCompatibleInMeal('olive_oil', 'vegetables', catalogMap), 'oil + salad ok')

const fatForBanana = pickFatProductId('banana', ['butter', 'olive_oil', 'peanut_butter'], 0, catalogMap)
ok(fatForBanana !== 'butter', 'banana meal avoids butter')

const fatForSalad = pickFatProductId('vegetables', ['butter', 'olive_oil'], 0, catalogMap)
ok(fatForSalad === 'olive_oil', 'salad meal prefers oil')

ok(clampProductGrams('potato', 80) >= 150, 'potato min 150g')
ok(clampProductGrams('vegetables', 2000) <= 350, 'salad max 350g')

const yogurtTags = buildProductTags({ mealRole: 'protein', pairsWith: ['fruit'], exclusions: ['lactose'] })
ok(parseMealRoleFromTags(yogurtTags) === 'protein', 'parse meal_role from tags')
ok(parsePairsWithFromTags(yogurtTags).includes('fruit'), 'parse pairs:fruit from tags')

const clubYogurtId = 'club-yogurt-1'
const customMap = buildNutritionCatalogMap([
  {
    id: clubYogurtId,
    club_id: 'club-1',
    label: 'Йогурт клубный',
    macro_group: 'protein',
    protein_per100: 10,
    fat_per100: 2,
    carbs_per100: 4,
    tags: yogurtTags,
    is_active: true,
  },
])

ok(getProductMealRole(clubYogurtId, customMap.get(clubYogurtId)) === 'protein', 'club yogurt role from tags')

const proteinForBanana = pickProteinProductId(
  'banana',
  ['chicken_breast', clubYogurtId],
  0,
  customMap,
)
ok(proteinForBanana === clubYogurtId, 'banana meal prefers yogurt with pairs:fruit over chicken')

const proteinForRice = pickProteinProductId(
  'rice',
  ['cottage_cheese_5', 'chicken_breast'],
  0,
  catalogMap,
)
ok(proteinForRice === 'chicken_breast', 'rice meal prefers chicken (pairs starchy) over cottage (pairs fruit)')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition meal pairing checks passed.')
