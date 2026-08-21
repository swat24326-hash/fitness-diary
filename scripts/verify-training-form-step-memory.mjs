/**
 * node scripts/verify-training-form-step-memory.mjs
 */
import {
  TRAINING_FORM_STEP_MAIN,
  clearTrainingFormPlaceMemory,
  clearTrainingFormStepMemory,
  clampTrainingFormStep,
  escapeTrainingExerciseSelectorId,
  filterCollapsedIdsForExercises,
  indexOfExerciseId,
  migrateTrainingFormPlace,
  pickScrollRestoreTarget,
  recallTrainingFormPlace,
  recallTrainingFormStep,
  rememberTrainingFormPlace,
  rememberTrainingFormStep,
  resolveTrainingFormPlaceKey,
  resolveTrainingFormStep,
  workoutHasNamedExercise,
} from '../src/lib/trainingFormStepMemory.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

clearTrainingFormStepMemory()

ok(clampTrainingFormStep(-1) === 0, 'clamp low')
ok(clampTrainingFormStep(99) === 4, 'clamp high')
ok(clampTrainingFormStep(2.7) === 2, 'clamp trunc')

ok(!workoutHasNamedExercise([{ name: '  ' }]), 'empty name not named')
ok(workoutHasNamedExercise([{ name: 'Жим' }]), 'named exercise')

ok(resolveTrainingFormStep({}) === 0, 'default survey')
ok(
  resolveTrainingFormStep({ exercises: [{ name: 'Присед' }] }) === TRAINING_FORM_STEP_MAIN,
  'named → main',
)

rememberTrainingFormStep('t-a', 3)
rememberTrainingFormStep('t-b', 2)
ok(recallTrainingFormStep('t-a') === 3, 'recall a')
ok(resolveTrainingFormStep({ trainingId: 't-a', exercises: [] }) === 3, 'remembered beats empty')
ok(resolveTrainingFormStep({ trainingId: 't-b', exercises: [{ name: 'X' }] }) === 2, 'remembered b')
ok(resolveTrainingFormStep({ trainingId: 't-new' }) === 0, 'unknown id → survey')

rememberTrainingFormStep('', 2)
ok(recallTrainingFormStep('') == null, 'empty id ignored')

clearTrainingFormStepMemory()
ok(recallTrainingFormStep('t-a') == null, 'cleared')

ok(
  resolveTrainingFormPlaceKey({ trainingId: 'tid', routeId: 'r', clientId: 'c' }) === 'tid',
  'place key prefers trainingId',
)
ok(
  resolveTrainingFormPlaceKey({ routeId: 'draft-1', clientId: 'c' }) === 'draft-1',
  'place key route',
)
ok(
  resolveTrainingFormPlaceKey({ routeId: 'new', clientId: 'c1' }) === 'new:c1',
  'place key new+client',
)

rememberTrainingFormPlace('new:c1', {
  step: 2,
  focusExerciseId: 'ex-9',
  scrollY: 420,
  collapsedIds: ['ex-1', 'ex-1', '', 'ex-2'],
})
const place = recallTrainingFormPlace('new:c1')
ok(place?.step === 2, 'place step')
ok(place?.focusExerciseId === 'ex-9', 'place focus exercise')
ok(place?.scrollY === 420, 'place scrollY')
ok(place?.collapsedIds?.join(',') === 'ex-1,ex-2', 'place collapsed dedupe')

ok(migrateTrainingFormPlace('new:c1', 'real-id') === true, 'migrate new→id')
ok(recallTrainingFormPlace('new:c1') == null, 'old key gone')
ok(recallTrainingFormPlace('real-id')?.focusExerciseId === 'ex-9', 'place moved')

ok(indexOfExerciseId([{ id: 'a' }, { id: 'ex-9' }], 'ex-9') === 1, 'index of exercise')
ok(indexOfExerciseId([{ id: 'a' }], 'missing') == null, 'index missing')

ok(
  filterCollapsedIdsForExercises(['ex-1', 'gone'], [{ id: 'ex-1' }, { id: 'ex-2' }]).join(',') ===
    'ex-1',
  'collapsed filtered to live exercises',
)

ok(pickScrollRestoreTarget({ focusExerciseId: 'ex-9', scrollY: 10 })?.type === 'exercise', 'scroll prefers exercise')
ok(pickScrollRestoreTarget({ focusExerciseId: null, scrollY: 80 })?.type === 'y', 'scroll falls back to y')
ok(pickScrollRestoreTarget({ step: 2 }) == null, 'no scroll target')
ok(typeof escapeTrainingExerciseSelectorId('x') === 'string', 'selector escape returns string')

clearTrainingFormPlaceMemory()

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
