/**
 * Проверка: completed не откатывается в draft (node scripts/verify-training-persist-status.mjs).
 */
import {
  isTrainingFirstCompletion,
  isTrainingStatusCompleted,
  resolveTrainingPersistStatus,
  shouldSkipDuplicateCompleteClick,
  shouldSkipDuplicateFirstCompletionSave,
  shouldSkipSilentPersistOfCompleted,
} from '../src/lib/trainingPersistStatusCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log('ok:', msg)
  else {
    console.error('FAIL:', msg)
    failed++
  }
}

ok(resolveTrainingPersistStatus('draft', null) === 'draft', 'new → draft')
ok(resolveTrainingPersistStatus('draft', 'draft') === 'draft', 'draft stays draft')
ok(resolveTrainingPersistStatus('completed', 'draft') === 'completed', 'finish draft')
ok(resolveTrainingPersistStatus('completed', 'completed') === 'completed', 'edit completed stays completed')
ok(resolveTrainingPersistStatus('draft', 'completed') === 'completed', 'disk/autosave cannot uncomplete')
ok(resolveTrainingPersistStatus('DRAFT', 'COMPLETED') === 'completed', 'case insensitive')
ok(resolveTrainingPersistStatus('', 'completed') === 'completed', 'empty request keeps completed')
ok(resolveTrainingPersistStatus(undefined, 'draft') === 'draft', 'empty request on draft')
ok(isTrainingStatusCompleted('completed'), 'completed flag')
ok(!isTrainingStatusCompleted('draft'), 'draft is not completed')
ok(isTrainingFirstCompletion('draft', 'completed'), 'first complete')
ok(!isTrainingFirstCompletion('completed', 'completed'), 'edit completed is not first')
ok(!isTrainingFirstCompletion('completed', 'draft'), 'uncomplete request still not first after resolve')

ok(shouldSkipDuplicateCompleteClick(true), 'second complete click while in flight')
ok(!shouldSkipDuplicateCompleteClick(false), 'first complete click proceeds')
ok(shouldSkipDuplicateFirstCompletionSave('completed', true), 'disk completed + firstCompletion persist skips overwrite')
ok(!shouldSkipDuplicateFirstCompletionSave('draft', true), 'disk draft still first complete')
ok(!shouldSkipDuplicateFirstCompletionSave('completed', false), 'edit completed is not duplicate first')
ok(shouldSkipSilentPersistOfCompleted('completed', true), 'autosave does not uncomplete')
ok(!shouldSkipSilentPersistOfCompleted('draft', true), 'autosave draft proceeds')
ok(!shouldSkipSilentPersistOfCompleted('completed', false), 'explicit save of completed proceeds')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll training-persist-status checks passed')
