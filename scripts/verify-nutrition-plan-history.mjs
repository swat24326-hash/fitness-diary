import {
  appendNutritionPlanHistory,
  nutritionPlanHistoryEntry,
  parseNutritionPlanHistory,
  removeNutritionPlanHistoryEntry,
  serializeNutritionPlanHistoryForStorage,
} from '../src/lib/nutrition/nutritionPlanHistoryCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const plan = {
  kcalTarget: 2500,
  mealsPerDay: 4,
  totals: { kcal: 2480, proteinG: 150, fatG: 70, carbsG: 280 },
}

const entry = nutritionPlanHistoryEntry(plan, '2026-07-11T12:00:00.000Z')
ok(entry.kcal === 2480, 'history entry kcal')
ok(entry.proteinG === 150, 'history entry protein')
ok(!('plan' in entry), 'history entry has no full plan')

const next = appendNutritionPlanHistory([], { plan, generatedAt: '2026-07-11T12:00:00.000Z' })
ok(next.length === 1, 'append one entry')
ok(next[0].fatG === 70, 'append keeps fatG')

const legacy = parseNutritionPlanHistory([
  {
    generated_at: '2026-06-01T10:00:00.000Z',
    plan: { kcalTarget: 3000, mealsPerDay: 3, totals: { kcal: 2950, proteinG: 180, fatG: 90, carbsG: 300 } },
  },
  entry,
])
ok(legacy.length === 2, 'parse legacy + compact')
ok(legacy[1].kcal === 2480, 'parse compact kcal')
ok(legacy[0].proteinG === 180, 'parse legacy protein from plan.totals')

const removed = removeNutritionPlanHistoryEntry(legacy, '2026-07-11T12:00:00.000Z')
ok(removed.length === 1, 'remove one history entry')
ok(removed[0].generated_at === '2026-06-01T10:00:00.000Z', 'removed correct entry')

const stored = serializeNutritionPlanHistoryForStorage(removed)
ok(stored.length === 1 && !('plan' in stored[0]), 'stored history compact')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll nutrition plan history checks passed.')
