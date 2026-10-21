/**
 * node scripts/verify-training-draft-restore.mjs
 */
import {
  compareTrainingDraftCandidates,
  isSearchPrefixDraft,
  pickTrainingDraftRestore,
  resolveSilentDraftWorkout,
  shouldApplyLateDraftRestore,
  workoutDraftContentScore,
} from '../src/lib/trainingDraftRestoreCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(workoutDraftContentScore({ cooldown: 'су' }) < workoutDraftContentScore({ cooldown: 'суставная' }), 'cooldown richness')
ok(
  workoutDraftContentScore({
    exercises: [{ name: 'Жим', sets: [{ reps: '10', weight: '50' }] }],
  }) >
    workoutDraftContentScore({ cooldown: 'суставная' }),
  'exercises outweigh cooldown only',
)

const rich = {
  workoutState: {
    cooldown: 'суставная',
    exercises: [{ name: 'Жим', sets: [{ reps: '10' }] }],
  },
  revisionMs: Date.parse('2026-08-26T10:00:00.000Z'),
}
const partial = {
  workoutState: { cooldown: 'су' },
  revisionMs: Date.parse('2026-08-26T10:00:30.000Z'),
}
ok(compareTrainingDraftCandidates(rich, partial) > 0, 'CRITICAL: richer draft wins over newer partial autosave')

const picked = pickTrainingDraftRestore({
  idbRow: {
    id: 't1',
    client_id: 'c1',
    status: 'draft',
    updated_at: '2026-08-26T10:00:30.000Z',
    data: { cooldown: 'су' },
  },
  durable: {
    clientId: 'c1',
    trainingId: 't1',
    status: 'draft',
    revisedAt: '2026-08-26T10:00:00.000Z',
    workoutState: {
      cooldown: 'суставная',
      exercises: [{ name: 'Тяга', sets: [{ reps: '12' }] }],
    },
  },
})
ok(picked.source === 'durable', 'pick prefers durable full body over idb partial')
ok(String(picked.workoutState.cooldown) === 'суставная', 'pick cooldown text')
ok(Array.isArray(picked.workoutState.exercises) && picked.workoutState.exercises.length === 1, 'pick exercises kept')

const sessionWin = pickTrainingDraftRestore({
  idbRow: {
    id: 't1',
    client_id: 'c1',
    status: 'draft',
    updated_at: '2026-08-26T09:00:00.000Z',
    data: {},
  },
  session: {
    trainingId: 't1',
    workoutState: { cooldown: 'суставная' },
    revisionMs: Date.parse('2026-08-26T10:01:00.000Z'),
  },
})
ok(sessionWin.source === 'session', 'session cache can restore after home navigation')

/* INC-2026-10-11-03: поздний restore после /new → /:id не затирает ввод, сделанный во время загрузки. */
const shownEmpty = { exercises: [{ name: '', sets: [{}] }] }
const weightOnly = { ...shownEmpty, pre_weight_kg: '62' }
const typedLive = { ...weightOnly, training_focus: 'Сила' }
ok(
  !shouldApplyLateDraftRestore({
    picked: { source: 'durable', workoutState: weightOnly },
    shownWorkoutState: shownEmpty,
    liveWorkoutState: typedLive,
    idbWorkoutState: shownEmpty,
  }),
  'CRITICAL: durable «только вес» не затирает направленность, введённую после показа',
)
ok(
  !shouldApplyLateDraftRestore({
    picked: { source: 'durable', workoutState: { ...typedLive, warmup: 'Суставная гимнастика' } },
    shownWorkoutState: shownEmpty,
    liveWorkoutState: weightOnly,
    idbWorkoutState: shownEmpty,
  }),
  'тренер уже правил экран — даже более богатая копия не подменяет живой ввод',
)
const richDurable = { cooldown: 'суставная', exercises: [{ name: 'Тяга', sets: [{ reps: '12' }] }] }
ok(
  shouldApplyLateDraftRestore({
    picked: { source: 'durable', workoutState: richDurable },
    shownWorkoutState: { cooldown: 'су' },
    liveWorkoutState: { cooldown: 'су' },
    idbWorkoutState: { cooldown: 'су' },
  }),
  'возврат на вкладку без ввода: устаревший LRU догоняется более полной durable-копией',
)
ok(
  shouldApplyLateDraftRestore({
    picked: { source: 'durable', workoutState: richDurable },
    shownWorkoutState: { cooldown: 'су' },
    liveWorkoutState: { cooldown: 'су', loyalty: { session_started_at: '2026-10-11T10:00:00.000Z' }, hr_session: { avg: 120 } },
    idbWorkoutState: { cooldown: 'су' },
  }),
  'штамп лояльности и пульс — не правка тренера, restore не блокируют',
)
ok(
  !shouldApplyLateDraftRestore({
    picked: { source: 'durable', workoutState: { cooldown: 'су' } },
    shownWorkoutState: richDurable,
    liveWorkoutState: richDurable,
    idbWorkoutState: richDurable,
  }),
  'более бедная копия экран не подменяет',
)
ok(
  !shouldApplyLateDraftRestore({
    picked: { source: 'empty', workoutState: {} },
    shownWorkoutState: {},
    liveWorkoutState: {},
  }),
  'пустой выбор — ничего не подменяем',
)

const searchPrefix = { exercises: [{ name: 'Жим', sets: [{ reps: '' }] }] }
const catalogPick = { exercises: [{ name: 'Жим лёжа', sets: [{ reps: '10' }] }] }
const silentResolved = resolveSilentDraftWorkout({
  trainingId: 't1',
  clientId: 'c1',
  snapshot: searchPrefix,
  live: { loadState: 'ok', meta: { trainingId: 't1' }, client: { id: 'c1' }, workoutState: catalogPick },
  durable: { trainingId: 't1', clientId: 'c1', workoutState: catalogPick },
})
ok(silentResolved.exercises[0].name === 'Жим лёжа', 'silent persist keeps catalog name, not search prefix')
ok(silentResolved.exercises[0].sets[0].reps === '10', 'silent persist keeps reps from the fuller snapshot')
ok(
  resolveSilentDraftWorkout({
    trainingId: 't1',
    clientId: 'c1',
    snapshot: searchPrefix,
    live: { loadState: 'ok', meta: { trainingId: 't2' }, client: { id: 'c2' }, workoutState: catalogPick },
  }).exercises[0].name === 'Жим',
  'silent persist does not take another draft',
)
ok(
  resolveSilentDraftWorkout({
    trainingId: 't1',
    clientId: 'c1',
    snapshot: catalogPick,
    live: { loadState: 'ok', meta: { trainingId: 't1' }, client: { id: 'c1' }, workoutState: searchPrefix },
  }).exercises[0].name === 'Жим лёжа',
  'poorer live snapshot does not erase the catalog pick',
)

const prefixMs = Date.parse('2026-10-21T16:00:25.704Z')
const fullMs = Date.parse('2026-10-21T16:00:23.708Z')
ok(isSearchPrefixDraft(searchPrefix, catalogPick), '«Жим» without reps is a search prefix of «Жим лёжа»')
ok(
  !isSearchPrefixDraft(
    { exercises: [{ name: 'Жим', sets: [{ reps: '10' }] }] },
    catalogPick,
  ),
  'short name that kept the reps is not treated as a cut',
)
const prefixPick = pickTrainingDraftRestore({
  idbRow: {
    id: 't1',
    client_id: 'c1',
    status: 'draft',
    data: searchPrefix,
    updated_at: '2026-10-21T16:00:25.704Z',
  },
  durable: {
    trainingId: 't1',
    clientId: 'c1',
    status: 'draft',
    workoutState: catalogPick,
    revisedAt: '2026-10-21T16:00:23.708Z',
  },
  expectClientId: 'c1',
})
ok(prefixPick.source === 'durable', 'return prefers durable catalog name over newer search prefix in IDB')
ok(prefixPick.workoutState.exercises[0].sets[0].reps === '10', 'return keeps reps from the catalog snapshot')
ok(
  compareTrainingDraftCandidates(
    { workoutState: { exercises: [{ name: 'Жим', sets: [{ reps: '10' }] }] }, revisionMs: prefixMs },
    { workoutState: catalogPick, revisionMs: fullMs },
  ) > 0,
  'intentional shorter name with the same reps stays newer',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-draft-restore: all passed')
