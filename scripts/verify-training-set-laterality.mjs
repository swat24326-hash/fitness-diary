/**
 * Проверка Л/П подхода (node scripts/verify-training-set-laterality.mjs).
 */
import {
  applyExerciseLaterality,
  collapseSetFromLaterality,
  emptyTrainingSetRow,
  exerciseLateralityIsLr,
  expandSetToLaterality,
  formatLateralitySetSummary,
  iterSetLoadSides,
  iterSetRpeValues,
  normalizeSetForStorage,
  trainingSetRowHasData,
  collectSetLoadNums,
  collectSetHrAfterNums,
  collectSetRpeNums,
  setHasAnyLateralityFields,
  maybeEnableLateralityFromLast,
  displayLateralityField,
  patchLateralitySetField,
  resultHasLaterality,
} from '../src/lib/trainingSetLateralityCore.js'
import {
  exerciseFormatAllowsLaterality,
  formatSetSummary,
  normalizeExercisesForStorage,
} from '../src/lib/trainingExerciseFormat.js'
import { bestMaxRepsFromSets } from '../src/lib/challengeLeaderboardCore.js'
import { getTrainingCompletionIssues } from '../src/lib/trainingCompletionValidation.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log('ok:', msg)
  else {
    console.error('FAIL:', msg)
    failed++
  }
}

ok(!exerciseLateralityIsLr({}), 'default not lr')
ok(exerciseLateralityIsLr({ laterality: 'lr' }), 'lr flag')
ok(exerciseLateralityIsLr({ sets: [{ reps_l: '8' }] }), 'infer lr from sides without flag')
ok(!exerciseLateralityIsLr({ sets: [{ reps: '8' }] }), 'bilateral only is not lr')
ok(exerciseFormatAllowsLaterality('Силовая'), 'strength allows lr')
ok(exerciseFormatAllowsLaterality('Функциональная'), 'functional allows lr')
ok(!exerciseFormatAllowsLaterality('Кардио'), 'cardio no lr')

const expanded = expandSetToLaterality({ reps: '10', weight_kg: '20' })
ok(expanded.reps_l === '10' && expanded.reps_r === '10', 'expand copies reps to both')
ok(expanded.weight_kg_l === '20' && expanded.weight_kg_r === '20', 'expand copies weight to both')

const already = expandSetToLaterality({ reps: '10', reps_l: '8', reps_r: '12', weight_kg_l: '16' })
ok(already.reps_l === '8' && already.reps_r === '12', 'expand keeps existing sides')

const collapsed = collapseSetFromLaterality({
  reps_l: '8',
  reps_r: '12',
  weight_kg_l: '16',
  weight_kg_r: '18',
})
ok(collapsed.reps === '8' && collapsed.weight_kg === '16', 'collapse prefers left')
ok(!collapsed.reps_l && !collapsed.reps_r, 'collapse clears sides')

const on = applyExerciseLaterality(
  { format: 'Силовая', sets: [{ reps: '10', weight_kg: '20' }] },
  true,
)
ok(on.laterality === 'lr', 'apply on')
ok(on.sets[0].reps_l === '10', 'apply expand')

const off = applyExerciseLaterality(on, false)
ok(off.laterality == null, 'apply off')
ok(off.sets[0].reps === '10', 'apply collapse keeps left')

ok(trainingSetRowHasData({ reps_l: '8' }), 'has data from left reps')
ok(!trainingSetRowHasData(emptyTrainingSetRow()), 'empty set has no data')

const stored = normalizeExercisesForStorage(
  [
    {
      name: 'Тяга гантели',
      laterality: 'lr',
      format: 'Силовая',
      sets: [{ reps_l: '10', reps_r: '8', weight_kg_l: '20', weight_kg_r: '20', rpe: '7' }],
    },
  ],
  'Силовая',
)
ok(stored[0].laterality === 'lr', 'storage keeps lr')
ok(stored[0].sets[0].reps === '', 'storage clears bilateral reps for lr')
ok(stored[0].sets[0].reps_l === '10' && stored[0].sets[0].reps_r === '8', 'storage keeps sides')

const cardioForced = normalizeExercisesForStorage(
  [
    {
      laterality: 'lr',
      format: 'Кардио',
      sets: [{ reps_l: '10', tut_sec: '12' }],
    },
  ],
  'Кардио',
)
ok(cardioForced[0].laterality == null, 'cardio storage drops lr')
ok(cardioForced[0].sets[0].tut_sec === '12', 'cardio time kept')
ok(!cardioForced[0].sets[0].reps_l, 'cardio storage no side keys')

const lrLine = formatLateralitySetSummary({
  weight_kg_l: '20',
  reps_l: '10',
  weight_kg_r: '18',
  reps_r: '8',
})
ok(lrLine.includes('Л 20 кг 10 повт.') && lrLine.includes('П 18 кг 8 повт.'), 'laterality summary')

const diary = formatSetSummary(
  { weight_kg_l: '20', reps_l: '10', weight_kg_r: '20', reps_r: '10', rpe: '8' },
  'Силовая',
)
ok(diary.includes('Л') && diary.includes('П') && diary.includes('RPE 8'), 'diary uses sides not —')
ok(!diary.includes('20 кг · 10 повт.'), 'diary does not duplicate bilateral')

const sides = iterSetLoadSides({ reps_l: '10', reps_r: '8', weight_kg_l: '20', weight_kg_r: '22' })
ok(sides.length === 2, 'two load sides')
ok(bestMaxRepsFromSets([{ reps_l: '10', reps_r: '14', weight_kg_l: '20', weight_kg_r: '20' }], null)?.value === 14, 'challenge takes better side')
ok(bestMaxRepsFromSets([{ reps_l: '8', weight_kg_l: '100', reps_r: '12', weight_kg_r: '40' }], 100)?.value === 8, 'challenge ref weight matches left')

ok(
  collectSetLoadNums([{ reps_l: '10', reps_r: '8', weight_kg_l: '20', weight_kg_r: '22' }], 'weight_kg').join(',') ===
    '20,22',
  'stats nums include both sides',
)

const storedSet = normalizeSetForStorage({ reps_l: '5', comment: 'слабее левая' }, true)
ok(storedSet.comment === 'слабее левая', 'comment preserved on lr set')

const issues = getTrainingCompletionIssues({
  pre_weight_kg: '80',
  training_focus: 'сила',
  mood: '4',
  desire: '4',
  sleep_hours: '8',
  hours_after_meal: '2',
  warmup: 'бег',
  warmup_duration_min: '5',
  cooldown: 'ходьба',
  cooldown_duration_min: '5',
  stars: '5',
  exercises: [
    {
      catalog_exercise_id: 'ex-1',
      laterality: 'lr',
      sets: [{ reps_l: '10', weight_kg_l: '12' }],
    },
  ],
})
ok(!issues.includes('Заполни вкладку «Упражнения».'), 'completion sees left-side data')

const mixedStored = normalizeExercisesForStorage(
  [
    {
      laterality: 'lr',
      format: 'Силовая',
      sets: [{ reps_l: '10', weight_kg: '20' }],
    },
  ],
  'Силовая',
)
ok(mixedStored[0].sets[0].weight_kg_l === '20' && mixedStored[0].sets[0].weight_kg_r === '20', 'mixed: bilateral weight fills empty sides')
ok(mixedStored[0].sets[0].reps_l === '10', 'mixed: keeps left reps')

const inferred = normalizeExercisesForStorage(
  [
    {
      format: 'Силовая',
      sets: [{ reps_l: '10', reps_r: '8', weight_kg_l: '20', weight_kg_r: '18' }],
    },
  ],
  'Силовая',
)
ok(inferred[0].laterality === 'lr', 'storage infers lr from sides without flag')
ok(inferred[0].sets[0].reps_r === '8', 'storage does not drop right side without flag')

ok(displayLateralityField({ reps: '10' }, 'reps_l', 'reps_r', 'reps') === '10', 'display fallback both empty')
ok(displayLateralityField({ reps_l: '8', reps: '10' }, 'reps_l', 'reps_r', 'reps') === '8', 'display prefers side')
ok(displayLateralityField({ reps_l: '8', reps: '10' }, 'reps_r', 'reps_l', 'reps') === '', 'display empty other side not fallback')

const hydratedEdit = patchLateralitySetField({ reps: '10', weight_kg: '20' }, 'reps_l', '8')
ok(hydratedEdit.reps_l === '8' && hydratedEdit.reps_r === '10', 'edit left hydrates right from bilateral')
ok(hydratedEdit.weight_kg_l === '20' && hydratedEdit.weight_kg_r === '20', 'edit hydrates both weights')
const storedAfterEdit = normalizeSetForStorage(hydratedEdit, true)
ok(storedAfterEdit.reps_r === '10' && storedAfterEdit.weight_kg_r === '20', 'hydrated edit persists other side')

const hrExpanded = expandSetToLaterality({ hr_after: '140' })
ok(hrExpanded.hr_after_l === '140' && hrExpanded.hr_after_r === '140', 'expand copies hr to both sides')

const hrStored = normalizeSetForStorage(
  { reps_l: '8', hr_after_l: '132', hr_after_r: '128', rpe: '7' },
  true,
)
ok(hrStored.hr_after_l === '132' && hrStored.hr_after_r === '128' && hrStored.hr_after === '', 'lr storage keeps side hr')

const rpeExpanded = expandSetToLaterality({ rpe: '8' })
ok(rpeExpanded.rpe_l === '8' && rpeExpanded.rpe_r === '8', 'expand copies rpe to both sides')

const rpeStored = normalizeSetForStorage({ reps_l: '8', rpe_l: '7', rpe_r: '9' }, true)
ok(rpeStored.rpe_l === '7' && rpeStored.rpe_r === '9' && rpeStored.rpe === '', 'lr storage keeps side rpe')

const hrDiary = formatSetSummary(
  {
    reps_l: '10',
    weight_kg_l: '20',
    hr_after_l: '130',
    rpe_l: '8',
    reps_r: '10',
    weight_kg_r: '20',
    hr_after_r: '135',
    rpe_r: '9',
  },
  'Функциональная',
)
ok(hrDiary.includes('Л') && hrDiary.includes('пульс 130') && hrDiary.includes('пульс 135'), 'diary hr per side')
ok(hrDiary.includes('RPE 8') && hrDiary.includes('RPE 9'), 'diary rpe per side')

const hrCollapse = collapseSetFromLaterality({
  reps_l: '10',
  hr_after_l: '132',
  hr_after_r: '128',
  rpe_l: '7',
  rpe_r: '9',
})
ok(hrCollapse.hr_after === '132' && hrCollapse.hr_after_l === '', 'collapse merges hr from left side')
ok(hrCollapse.rpe === '7', 'collapse merges rpe from left side')

const hrBilateral = normalizeSetForStorage(hrCollapse, false)
ok(hrBilateral.hr_after === '132' && !('hr_after_l' in hrBilateral), 'bilateral storage keeps collapsed hr')

const rpeStats = collectSetRpeNums([{ reps_l: '8', rpe_l: '7', rpe_r: '9' }])
ok(rpeStats.length === 2 && rpeStats.includes(7) && rpeStats.includes(9), 'stats rpe collects both lr sides')

const hrStats = collectSetHrAfterNums([{ reps_l: '8', hr_after_l: '130', hr_after_r: '135' }])
ok(hrStats.length === 2 && hrStats.includes(130) && hrStats.includes(135), 'stats hr collects both lr sides')

const onlyRightHr = collapseSetFromLaterality({ hr_after_r: '128' })
ok(onlyRightHr.hr_after === '128', 'collapse keeps right hr if left empty')

const fromLast = maybeEnableLateralityFromLast(
  { format: 'Силовая', sets: [emptyTrainingSetRow()] },
  { laterality: 'lr', sets: [{ reps_l: '10' }] },
  true,
)
ok(fromLast.laterality === 'lr', 'empty exercise inherits lr from last result')

const noClobber = maybeEnableLateralityFromLast(
  { format: 'Силовая', sets: [{ reps: '12', weight_kg: '30' }] },
  { laterality: 'lr', sets: [{ reps_l: '10' }] },
  true,
)
ok(noClobber.laterality == null, 'do not auto lr over typed bilateral')

ok(resultHasLaterality({ sets: [{ reps_r: '6' }] }), 'result sides count as laterality')

const onlyRight = collapseSetFromLaterality({ reps_r: '9', weight_kg_r: '14' })
ok(onlyRight.reps === '9' && onlyRight.weight_kg === '14', 'collapse keeps right if left empty')

const rpeOnlyInfer = normalizeExercisesForStorage(
  [{ format: 'Силовая', sets: [{ rpe_l: '7', rpe_r: '9' }] }],
  'Силовая',
)
ok(rpeOnlyInfer[0].laterality === 'lr', 'storage infers lr from side rpe only')
ok(rpeOnlyInfer[0].sets[0].rpe_l === '7' && rpeOnlyInfer[0].sets[0].rpe_r === '9', 'storage keeps both side rpe')

const metricsDiary = formatSetSummary({ rpe_l: '8', rpe_r: '9', hr_after_l: '130', hr_after_r: '135' }, 'Функциональная')
ok(metricsDiary.includes('RPE 8') && metricsDiary.includes('RPE 9'), 'diary lr metrics without load sides')

const lrOffFunctional = applyExerciseLaterality(
  {
    format: 'Функциональная',
    laterality: 'lr',
    sets: [{ reps_l: '10', hr_after_l: '130', hr_after_r: '140', rpe_l: '7', rpe_r: '9' }],
  },
  false,
)
ok(lrOffFunctional.sets[0].hr_after === '130' && lrOffFunctional.sets[0].rpe === '7', 'lr off keeps collapsed hr and rpe')

const toCardio = normalizeExercisesForStorage(
  [
    {
      format: 'Кардио',
      sets: [
        {
          tut_sec: '12',
          load: '5',
          hr_after: '130',
          rpe: '7',
        },
      ],
    },
  ],
  'Кардио',
)
ok(toCardio[0].laterality == null && toCardio[0].sets[0].tut_sec === '12', 'cardio keeps time after lr collapse path')

let maxRpe = null
for (const v of iterSetRpeValues({ reps_l: '10', rpe_l: '8', rpe_r: '9' })) {
  const n = Number(v)
  if (n > 0) maxRpe = maxRpe == null ? n : Math.max(maxRpe, n)
}
ok(maxRpe === 9, 'max rpe picks best lr side')

ok(setHasAnyLateralityFields({ rpe_l: '8' }), 'any laterality from side rpe')
ok(!setHasAnyLateralityFields({ rpe: '8' }), 'bilateral rpe alone is not lr')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll training-set-laterality checks passed')
