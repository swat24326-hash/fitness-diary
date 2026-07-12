import {
  countImportedTrainingWeights,
  needsWeightImportRefresh,
  pickLastWeightEntryDate,
} from '../src/lib/weightImportCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const picks = [{ trainingId: 't1' }, { trainingId: 't2' }, { trainingId: 't3' }]

ok(countImportedTrainingWeights([]) === 0, 'no imported weights')
ok(
  countImportedTrainingWeights([
    { source: 'training', training_id: 't1' },
    { source: 'training', training_id: 't1' },
    { source: 'manual' },
  ]) === 1,
  'count unique training ids',
)
ok(
  countImportedTrainingWeights([
    { source: 'training', training_id: 't1' },
    { source: 'training', training_id: 't2' },
  ]) === 2,
  'count two trainings',
)

ok(!needsWeightImportRefresh([], []), 'no picks no refresh')
ok(needsWeightImportRefresh(picks, []), 'empty history needs refresh')
ok(needsWeightImportRefresh(picks, [{ source: 'training', training_id: 't1' }]), 'partial import needs refresh')
ok(
  !needsWeightImportRefresh(picks, [
    { source: 'training', training_id: 't1' },
    { source: 'training', training_id: 't2' },
    { source: 'training', training_id: 't3' },
  ]),
  'full import no refresh',
)

ok(pickLastWeightEntryDate([]) === null, 'no last date')
ok(
  pickLastWeightEntryDate([
    { date: '2026-03-01', source: 'baseline' },
    { date: '2026-04-10', source: 'training' },
    { date: '2026-04-05', source: 'manual' },
  ]) === '2026-04-10',
  'last non-baseline date',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-weight-import: all ok')
