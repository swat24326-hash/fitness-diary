import { buildNutritionCatalogMap, filterCatalogProductsByExclusions } from '../src/lib/nutrition/nutritionCatalogResolve.js'
import { normalizeNutritionProductRow } from '../src/lib/nutrition/nutritionProductsCore.js'
import { isNutritionPlanStale, nutritionPlanStaleMessage } from '../src/lib/nutrition/nutritionPlanStaleCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const clubRow = normalizeNutritionProductRow({
  id: 'np-1',
  club_id: 'club-1',
  label: 'Тестовый творог',
  macro_group: 'protein',
  protein_per100: 18,
  fat_per100: 2,
  carbs_per100: 3,
  tags: ['lactose'],
  is_active: true,
})
ok(clubRow?.label === 'Тестовый творог', 'normalize club product')

const mapClub = buildNutritionCatalogMap([clubRow])
ok(mapClub.size === 1, 'club catalog only club products')
ok(mapClub.get('np-1')?.source === 'club', 'club source')

const mapEmpty = buildNutritionCatalogMap([])
ok(mapEmpty.size > 20, 'empty club falls back to builtin')
ok(mapEmpty.values().next().value?.source === 'builtin', 'builtin fallback')

const filtered = filterCatalogProductsByExclusions(['np-1'], ['lactose'], mapClub)
ok(filtered.length === 0, 'lactose filter on club product')

ok(!isNutritionPlanStale({ weight_kg: 75, height_cm: 170 }, { basis: { weightKg: 75, heightCm: 170 } }), 'plan fresh')
ok(isNutritionPlanStale({ weight_kg: 74, height_cm: 170 }, { basis: { weightKg: 75, heightCm: 170 } }), 'plan stale on weight')
ok(nutritionPlanStaleMessage({ weight_kg: 74, height_cm: 170 }, { basis: { weightKg: 75, heightCm: 170 } })?.includes('74'), 'stale message')

process.exit(failed > 0 ? 1 : 0)
