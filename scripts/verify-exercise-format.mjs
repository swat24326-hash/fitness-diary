/**
 * Проверка логики форматов упражнений (node scripts/verify-exercise-format.mjs).
 */
import {
  TRAINING_EXERCISE_FORMATS,
  TRAINING_SESSION_TYPES,
  deriveTrainingTypeFromExercises,
  exerciseFormatIsCardio,
  exerciseFormatWithSetHr,
  formatSetSummary,
  normalizeExerciseFormat,
  normalizeExercisesForStorage,
} from '../src/lib/trainingExerciseFormat.js'

let failed = 0

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

assert(TRAINING_EXERCISE_FORMATS.length === 3, '3 exercise formats')
assert(TRAINING_SESSION_TYPES.includes('Смешанная'), 'session types include mixed')

assert(normalizeExerciseFormat('Кардио') === 'Кардио', 'normalize cardio')
assert(normalizeExerciseFormat('', 'Функциональная') === 'Функциональная', 'fallback functional')
assert(normalizeExerciseFormat('bad', 'Силовая') === 'Силовая', 'invalid -> silovaya')

assert(exerciseFormatIsCardio('Кардио') === true, 'cardio detect')
assert(exerciseFormatWithSetHr('Функциональная') === true, 'functional hr')
assert(exerciseFormatWithSetHr('Силовая') === false, 'strength no hr')

const mixed = [
  { format: 'Силовая', sets: [] },
  { format: 'Кардио', sets: [] },
]
assert(deriveTrainingTypeFromExercises(mixed, 'Силовая') === 'Смешанная', 'mixed session type')

const allStrength = [{ format: 'Силовая' }, { format: 'Силовая' }]
assert(deriveTrainingTypeFromExercises(allStrength) === 'Силовая', 'uniform strength')

const legacy = [{ name: 'Жим', sets: [{ reps: '5', weight_kg: '80' }] }]
const stored = normalizeExercisesForStorage(legacy, 'Силовая')
assert(stored[0].format === 'Силовая', 'legacy exercise gets format on normalize')
assert(stored[0].sets[0].weight_kg === '80', 'legacy sets preserved')

const cardioLine = formatSetSummary({ tut_sec: '12', load: '5', hr_after: '140', rpe: '7' }, 'Кардио')
assert(cardioLine.includes('12 мин') && cardioLine.includes('нагр. 5'), 'cardio summary')

const strengthLine = formatSetSummary({ weight_kg: '60', reps: '8', rpe: '8' }, 'Силовая')
assert(strengthLine.includes('60 кг') && strengthLine.includes('8 повт.'), 'strength summary')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll exercise-format checks passed.')
