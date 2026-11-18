/**
 * Копирование нагрузки подхода без пульса (node scripts/verify-training-set-copy.mjs).
 */
import {
  TRAINING_SET_COPYABLE_KEYS,
  copyTrainingSetLoadFromPrevious,
  trainingSetHasCopyableLoad,
} from '../src/lib/trainingSetCopyCore.js'
import { emptyTrainingSetRow } from '../src/lib/trainingSetLateralityCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log('ok:', msg)
  else {
    console.error('FAIL:', msg)
    failed++
  }
}

ok(!trainingSetHasCopyableLoad(null), 'null — нечего копировать')
ok(!trainingSetHasCopyableLoad(emptyTrainingSetRow()), 'пустой подход')
ok(!trainingSetHasCopyableLoad({ hr_after: '140', hr_after_l: '138' }), 'только пульс — не копируем')
ok(trainingSetHasCopyableLoad({ reps: '8', weight_kg: '60' }), 'есть нагрузка')
ok(trainingSetHasCopyableLoad({ reps_l: '8', weight_kg_r: '20' }), 'есть Л/П нагрузка')
ok(trainingSetHasCopyableLoad({ tut_sec: '5', load: '6' }), 'кардио нагрузка')
ok(TRAINING_SET_COPYABLE_KEYS.every((k) => !String(k).startsWith('hr')), 'copyable без hr_*')

const prev = {
  ...emptyTrainingSetRow(),
  reps: '10',
  weight_kg: '80',
  rpe: '7',
  hr_after: '155',
}
const target = {
  ...emptyTrainingSetRow(),
  reps: '3',
  weight_kg: '40',
  rpe: '4',
  hr_after: '120',
}
const next = copyTrainingSetLoadFromPrevious(prev, target)
ok(next.reps === '10' && next.weight_kg === '80' && next.rpe === '7', 'нагрузка из предыдущего')
ok(next.hr_after === '120', 'пульс target сохранён')
ok(prev.hr_after === '155', 'prev не мутирован')

const emptyTarget = copyTrainingSetLoadFromPrevious(prev, emptyTrainingSetRow())
ok(emptyTarget.reps === '10' && emptyTarget.hr_after === '', 'в пустой — нагрузка да, пульс пуст')

const lrPrev = {
  ...emptyTrainingSetRow(),
  reps_l: '8',
  reps_r: '10',
  weight_kg_l: '16',
  weight_kg_r: '18',
  rpe_l: '6',
  rpe_r: '7',
  hr_after_l: '140',
  hr_after_r: '142',
}
const lrTarget = {
  ...emptyTrainingSetRow(),
  hr_after_l: '110',
  hr_after_r: '112',
}
const lrNext = copyTrainingSetLoadFromPrevious(lrPrev, lrTarget)
ok(lrNext.reps_l === '8' && lrNext.weight_kg_r === '18' && lrNext.rpe_r === '7', 'Л/П нагрузка')
ok(lrNext.hr_after_l === '110' && lrNext.hr_after_r === '112', 'Л/П пульс target сохранён')

const cardioPrev = { ...emptyTrainingSetRow(), tut_sec: '12', load: '8', rpe: '5', hr_after: '160' }
const cardioNext = copyTrainingSetLoadFromPrevious(cardioPrev, { ...emptyTrainingSetRow(), hr_after: '99' })
ok(cardioNext.tut_sec === '12' && cardioNext.load === '8' && cardioNext.rpe === '5', 'кардио поля')
ok(cardioNext.hr_after === '99', 'кардио пульс сохранён')

const onlyHrPrev = { ...emptyTrainingSetRow(), hr_after: '150' }
const cleared = copyTrainingSetLoadFromPrevious(onlyHrPrev, {
  ...emptyTrainingSetRow(),
  reps: '5',
  hr_after: '100',
})
ok(cleared.reps === '' && cleared.hr_after === '100', 'пустая нагрузка prev затирает load, не пульс')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll training-set-copy checks passed')
