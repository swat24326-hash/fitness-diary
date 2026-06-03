import {
  bestMaxRepsFromSets,
  buildChallengeLeaderboard,
  parseReferenceWeightKg,
  weightMatchesReferenceKg,
} from '../src/lib/challengeLeaderboardCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parseReferenceWeightKg('100') === 100, 'parse ref weight')
ok(parseReferenceWeightKg('') == null, 'empty ref null')
ok(weightMatchesReferenceKg(100, 100), 'exact weight match')
ok(weightMatchesReferenceKg(100.4, 100), 'within tolerance')
ok(!weightMatchesReferenceKg(99, 100), 'below tolerance')

const freeSets = [
  { reps: 5, weight_kg: 100 },
  { reps: 12, weight_kg: 60 },
  { reps: 12, weight_kg: 80 },
]
const freeBest = bestMaxRepsFromSets(freeSets, null)
ok(freeBest?.value === 12, 'free mode max reps')
ok(freeBest?.weight_kg == null, 'free mode no ref weight in result')

const at100Sets = [
  { reps: 8, weight_kg: 100 },
  { reps: 15, weight_kg: 40 },
  { reps: 10, weight_kg: 100 },
]
const at100 = bestMaxRepsFromSets(at100Sets, 100)
ok(at100?.value === 10, 'ref weight only counts matching sets')
ok(at100?.weight_kg === 100, 'ref weight preserved')

const challenge = {
  club_id: 'club-1',
  exercise_id: 'ex-1',
  metric: 'max_reps',
  reference_weight_kg: 100,
  start_date: '2026-06-01',
  end_date: '2026-06-30',
}

const ctx = {
  exercises: [{ id: 'ex-1', name: 'Жим лёжа' }],
  clients: [
    { id: 'c1', club_id: 'club-1', name: 'Аня', trainer_id: 't1' },
    { id: 'c2', club_id: 'club-1', name: 'Боря', trainer_id: 't1' },
  ],
  trainings: [
    {
      client_id: 'c1',
      club_id: 'club-1',
      status: 'completed',
      date: '2026-06-10',
      data: {
        exercises: [
          {
            catalog_exercise_id: 'ex-1',
            sets: [
              { reps: 12, weight_kg: 40 },
              { reps: 8, weight_kg: 100 },
            ],
          },
        ],
      },
    },
    {
      client_id: 'c2',
      club_id: 'club-1',
      status: 'completed',
      date: '2026-06-11',
      data: {
        exercises: [
          {
            catalog_exercise_id: 'ex-1',
            sets: [{ reps: 10, weight_kg: 100 }],
          },
        ],
      },
    },
  ],
  trainerNameById: new Map([['t1', 'Тренер']]),
}

const lb = buildChallengeLeaderboard(challenge, ctx)
ok(lb.rows.length === 2, 'leaderboard two clients')
ok(lb.rows[0].client_id === 'c2' && lb.rows[0].value === 10, 'winner higher reps at 100kg')
ok(lb.rows[1].value === 8, 'second only 100kg sets count')

const pullups = {
  ...challenge,
  reference_weight_kg: null,
  metric: 'max_reps',
}
const lb2 = buildChallengeLeaderboard(pullups, {
  ...ctx,
  trainings: [
    {
      client_id: 'c1',
      club_id: 'club-1',
      status: 'completed',
      date: '2026-06-10',
      data: { exercises: [{ catalog_exercise_id: 'ex-1', sets: [{ reps: 20, weight_kg: 0 }] }] },
    },
  ],
})
ok(lb2.rows[0]?.value === 20, 'bodyweight challenge max reps any weight')

if (failed) process.exit(1)
console.log('verify-challenge-max-reps: all passed')
