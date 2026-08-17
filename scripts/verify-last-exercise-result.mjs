import {
  exerciseMatchesLookup,
  findLastExerciseResult,
  normExerciseNameForMatch,
} from '../src/lib/lastExerciseResult.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const catalogId = 'ex-bulgarian'
const trainings = [
  {
    id: 't-old',
    status: 'completed',
    date: '2026-06-01',
    created_at: '2026-06-01T10:00:00Z',
    data: {
      exercises: [
        {
          name: 'Болгарские выпады',
          catalog_exercise_id: catalogId,
          format: 'Силовая',
          sets: [{ reps: '10', weight_kg: '10', rpe: '7' }],
          muscle_focus: 'квадрицепс',
        },
      ],
    },
  },
  {
    id: 't-new',
    status: 'completed',
    date: '2026-06-20',
    created_at: '2026-06-20T10:00:00Z',
    data: {
      exercises: [
        {
          name: 'Болгарские выпады',
          catalog_exercise_id: catalogId,
          format: 'Силовая',
          sets: [
            { reps: '10', weight_kg: '12', rpe: '8' },
            { reps: '8', weight_kg: '12', rpe: '9' },
          ],
          muscle_focus: 'ягодицы',
        },
      ],
    },
  },
  {
    id: 't-draft',
    status: 'draft',
    date: '2026-06-25',
    data: {
      exercises: [{ name: 'Болгарские выпады', catalog_exercise_id: catalogId, sets: [{ reps: '99' }] }],
    },
  },
]

ok(normExerciseNameForMatch('  Болгарские   выпады ') === 'болгарские выпады', 'norm name')
ok(exerciseMatchesLookup({ catalog_exercise_id: catalogId, name: 'X' }, { catalogExerciseId: catalogId }), 'match by id')

const last = findLastExerciseResult(
  trainings,
  { catalogExerciseId: catalogId, name: 'Болгарские выпады' },
  { excludeTrainingId: 'current' },
)
ok(last?.trainingId === 't-new', 'latest completed')
ok(last?.sets.length === 2, 'last sets count')
ok(last?.muscle_focus === 'ягодицы', 'last muscle focus')
ok(last?.laterality == null, 'bilateral last has no lr')

const lastLr = findLastExerciseResult(
  [
    {
      id: 't-lr',
      status: 'completed',
      date: '2026-07-01',
      data: {
        exercises: [
          {
            name: 'Тяга гантели',
            catalog_exercise_id: 'ex-row',
            laterality: 'lr',
            sets: [{ reps_l: '10', reps_r: '8', weight_kg_l: '20', weight_kg_r: '20' }],
          },
        ],
      },
    },
  ],
  { catalogExerciseId: 'ex-row' },
)
ok(lastLr?.laterality === 'lr', 'last result keeps laterality flag')

const excluded = findLastExerciseResult(trainings, { catalogExerciseId: catalogId }, { excludeTrainingId: 't-new' })
ok(excluded?.trainingId === 't-old', 'exclude current training')

const byName = findLastExerciseResult(
  [
    {
      id: 't1',
      status: 'completed',
      date: '2026-05-01',
      data: { exercises: [{ name: 'Жим лёжа', sets: [{ reps: '5', weight_kg: '60' }] }] },
    },
  ],
  { name: 'жим лёжа' },
)
ok(byName?.sets[0]?.weight_kg === '60', 'match by normalized name')

ok(findLastExerciseResult([], { catalogExerciseId: catalogId }) === null, 'empty trainings')

process.exit(failed > 0 ? 1 : 0)
