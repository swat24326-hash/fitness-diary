import {
  TRAINING_FORM_STEP_MAIN,
  clearTrainingFormStepMemory,
  clampTrainingFormStep,
  recallTrainingFormStep,
  rememberTrainingFormStep,
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

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
