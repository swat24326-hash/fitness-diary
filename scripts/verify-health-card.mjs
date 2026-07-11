import {
  buildWeightChartSeries,
  findBaselineWeightEntry,
  getHealthCardCompletionIssues,
  isHealthCardComplete,
  normalizeHealthSex,
  parseHealthFilledAt,
  resolveHealthFilledAtOnSave,
  resolveBaselineWeightDate,
  filterWeightEntriesForDisplay,
  listBaselineLikeEntries,
} from '../src/lib/healthCardCore.js'
import { appendNutritionPlanHistory, parseNutritionPlanHistory } from '../src/lib/nutrition/nutritionPlanHistoryCore.js'
import { getTrainingCompletionIssues } from '../src/lib/trainingCompletionValidation.js'
import { getNutritionHealthBasics, isNutritionHealthReady } from '../src/lib/nutrition/nutritionPlanBuilder.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeHealthSex('male') === 'male', 'sex male')
ok(normalizeHealthSex('x') === null, 'sex invalid null')
ok(parseHealthFilledAt('2026-06-15') === '2026-06-15', 'filled at parse')
ok(parseHealthFilledAt('bad') === null, 'filled at invalid')

const incomplete = { height_cm: 170 }
ok(!isHealthCardComplete(incomplete), 'incomplete without weight/sex/date')
ok(getHealthCardCompletionIssues(incomplete).length === 3, 'three missing fields')

const complete = {
  height_cm: 170,
  initial_weight_kg: 80,
  current_weight_kg: 80,
  sex: 'female',
  health_filled_at: '2026-06-01',
}
ok(isHealthCardComplete(complete), 'complete health card')
ok(isNutritionHealthReady(complete), 'nutrition ready with sex')

const basics = getNutritionHealthBasics(complete, { age: 30 })
ok(basics.sex === 'female', 'sex from health in nutrition basics')

ok(
  resolveHealthFilledAtOnSave(null, '2026-05-10', '2026-06-20') === '2026-05-10',
  'first save uses form date',
)
ok(
  resolveHealthFilledAtOnSave('2026-04-01', '2026-05-10', '2026-06-20') === '2026-04-01',
  'keep existing filled at',
)

const entries = [
  { id: '1', date: '2026-06-01', weight_kg: 80, source: 'baseline', created_at: 'a' },
  { id: '2', date: '2026-06-10', weight_kg: 78, source: 'manual', created_at: 'b' },
]
ok(findBaselineWeightEntry(entries)?.id === '1', 'find baseline entry')
const chart = buildWeightChartSeries(entries)
ok(chart.labels.length === 2 && chart.values[1] === 78, 'weight chart series')

const history = appendNutritionPlanHistory([], {
  plan: { kcalTarget: 2000, mealsPerDay: 4 },
  generatedAt: '2026-06-01T10:00:00Z',
})
ok(parseNutritionPlanHistory(history).length === 1, 'plan history append')
ok(history[0].kcalTarget === 2000, 'plan history kcal')

ok(getHealthCardCompletionIssues(complete).length === 0, 'no issues when complete')

ok(
  resolveBaselineWeightDate({
    entries: [{ date: '2026-03-15', source: 'training' }],
    healthFilledAt: '2026-06-01',
  }) === '2026-03-14',
  'baseline day before first training',
)
ok(
  resolveBaselineWeightDate({ entries: [], healthFilledAt: '2026-06-01' }) === '2026-06-01',
  'baseline falls back to card date when no other points',
)

const dupEntries = [
  { id: 'b1', date: '2026-07-11', weight_kg: 94, source: 'baseline', created_at: 'a' },
  { id: 'b2', date: '2026-07-11', weight_kg: 93, source: 'initial_adjust', created_at: 'b' },
  { id: 'm1', date: '2026-06-02', weight_kg: 89, source: 'training', created_at: 'c' },
]
ok(listBaselineLikeEntries(dupEntries).length === 2, 'two baseline-like rows')
const shown = filterWeightEntriesForDisplay(dupEntries, complete)
ok(shown.filter((r) => r.source === 'baseline' || r.source === 'initial_adjust').length === 1, 'one baseline in UI')
ok(shown.find((r) => r.source === 'baseline')?.date === '2026-06-01', 'baseline at chart start before training')
ok(shown.find((r) => r.source === 'baseline')?.weight_kg === 80, 'baseline weight from health card')
ok(shown.length === 2, 'baseline + training in UI')

const gateIssues = getTrainingCompletionIssues({}, { health: incomplete, isFirstCompletion: true })
ok(gateIssues.some((m) => m.includes('карте здоровья')), 'first training blocked without health card')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll health card checks passed.')
