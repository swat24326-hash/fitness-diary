import {
  didInitialWeightChange,
  findWeightEntryForTrainingUpsert,
  formatWeightProgressDelta,
  getHealthCurrentWeightKg,
  getHealthInitialWeightKg,
  normalizeHealthCardWeights,
  parseWeightKg,
  pickLatestTrainingPreWeight,
  listTrainingPreWeights,
  sortWeightEntriesDesc,
  suggestTrainingPreWeightInput,
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

const allPicks = listTrainingPreWeights(trainings)
ok(allPicks.length === 2, 'two completed trainings with weight')
ok(allPicks[0].trainingId === '3' && allPicks[1].trainingId === '2', 'training weights chronological')

ok(didInitialWeightChange(80, 80) === false, 'same initial')
ok(didInitialWeightChange(80, 81) === true, 'initial changed')

const sorted = sortWeightEntriesDesc([
  { date: '2026-06-01', created_at: 'a' },
  { date: '2026-06-10', created_at: 'b' },
])
ok(sorted[0].date === '2026-06-10', 'sort entries desc')

ok(weightEntrySourceLabelRu('baseline') === 'Исходный (карта здоровья)', 'source label baseline')

ok(
  suggestTrainingPreWeightInput({ current_weight_kg: 72.5 }, []) === '',
  'новая тренировка: вес из карты не подставляем',
)
ok(suggestTrainingPreWeightInput({}, []) === '', 'suggest empty without trainings')
ok(
  suggestTrainingPreWeightInput({ initial_weight_kg: 80 }, [
    { id: '2', status: 'completed', date: '2026-06-22', data: { pre_weight_kg: 79.2 } },
  ]) === '79.2',
  'подставляем вес с последней завершённой тренировки',
)
ok(
  suggestTrainingPreWeightInput({ current_weight_kg: 99 }, [
    { id: 'd', status: 'draft', date: '2026-06-22', data: { pre_weight_kg: 88 } },
  ]) === '',
  'черновик не даёт подсказку веса',
)

const noClaimBaseline = findWeightEntryForTrainingUpsert(
  [{ id: 'b1', date: '2026-07-17', source: 'baseline', weight_kg: 72, created_at: 'a' }],
  { trainingId: 't1', date: '2026-07-17' },
)
ok(noClaimBaseline.kind === 'insert', 'same-day baseline not claimed — keep исходный separate')

const noClaimLegacy = findWeightEntryForTrainingUpsert(
  [{ id: 'b2', date: '2026-07-17', source: 'initial_adjust', weight_kg: 72, created_at: 'a' }],
  { trainingId: 't1', date: '2026-07-17' },
)
ok(noClaimLegacy.kind === 'insert', 'same-day initial_adjust not claimed')

const claimManual = findWeightEntryForTrainingUpsert(
  [{ id: 'm1', date: '2026-07-17', source: 'manual', weight_kg: 72, created_at: 'a' }],
  { trainingId: 't1', date: '2026-07-17' },
)
ok(claimManual.kind === 'claim' && claimManual.row?.id === 'm1', 'same-day manual claimed by training')

const update = findWeightEntryForTrainingUpsert(
  [{ id: 'tr', date: '2026-07-17', source: 'training', training_id: 't1', weight_kg: 72, created_at: 'a' }],
  { trainingId: 't1', date: '2026-07-17' },
)
ok(update.kind === 'update' && update.row?.id === 'tr', 'same training_id updates')

const insert = findWeightEntryForTrainingUpsert(
  [{ id: 'tr2', date: '2026-07-17', source: 'training', training_id: 'other', weight_kg: 71, created_at: 'a' }],
  { trainingId: 't1', date: '2026-07-17' },
)
ok(insert.kind === 'insert', 'second training same day keeps own entry')

const health = { current_weight_kg: 77, height_cm: 170 }
const plan = { basis: { weightKg: 80, heightCm: 170 } }
ok(isNutritionPlanStale(health, plan), 'stale when current differs')
ok(nutritionPlanStaleMessage(health, plan)?.includes('77'), 'stale message has new weight')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll client weight checks passed.')
