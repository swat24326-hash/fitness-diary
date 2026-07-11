import {
  didInitialWeightChange,
  formatWeightProgressDelta,
  getHealthCurrentWeightKg,
  getHealthInitialWeightKg,
  normalizeHealthCardWeights,
  parseWeightKg,
  pickLatestTrainingPreWeight,
  sortWeightEntriesDesc,
  weightEntrySourceLabelRu,
} from '../src/lib/clientWeightCore.js'
import { isNutritionPlanStale, nutritionPlanStaleMessage } from '../src/lib/nutrition/nutritionPlanStaleCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parseWeightKg('82,5') === 82.5, 'parse comma weight')
ok(parseWeightKg('') === null, 'empty weight null')
ok(parseWeightKg('-1') === null, 'negative weight null')

const legacy = normalizeHealthCardWeights({ weight_kg: 80 })
ok(getHealthInitialWeightKg(legacy) === 80, 'legacy → initial')
ok(getHealthCurrentWeightKg(legacy) === 80, 'legacy → current')

const split = normalizeHealthCardWeights({
  initial_weight_kg: 85,
  current_weight_kg: 78.5,
  weight_kg: 78.5,
})
ok(getHealthCurrentWeightKg(split) === 78.5, 'current from field')
ok(formatWeightProgressDelta(split)?.delta === -6.5, 'progress delta')

const trainings = [
  { id: '1', status: 'draft', date: '2026-06-20', data: { pre_weight_kg: 70 } },
  { id: '2', status: 'completed', date: '2026-06-22', data: { pre_weight_kg: 79.2 } },
  { id: '3', status: 'completed', date: '2026-06-21', data: { pre_weight_kg: 80 } },
]
const picked = pickLatestTrainingPreWeight(trainings)
ok(picked?.weightKg === 79.2, 'latest completed training weight')
ok(picked?.training?.id === '2', 'latest training id')

ok(didInitialWeightChange(80, 80) === false, 'same initial')
ok(didInitialWeightChange(80, 81) === true, 'initial changed')

const sorted = sortWeightEntriesDesc([
  { date: '2026-06-01', created_at: 'a' },
  { date: '2026-06-10', created_at: 'b' },
])
ok(sorted[0].date === '2026-06-10', 'sort entries desc')

ok(weightEntrySourceLabelRu('baseline') === 'Исходный (карта здоровья)', 'source label baseline')

const health = { current_weight_kg: 77, height_cm: 170 }
const plan = { basis: { weightKg: 80, heightCm: 170 } }
ok(isNutritionPlanStale(health, plan), 'stale when current differs')
ok(nutritionPlanStaleMessage(health, plan)?.includes('77'), 'stale message has new weight')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll client weight checks passed.')
