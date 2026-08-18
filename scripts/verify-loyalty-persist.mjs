/**
 * node scripts/verify-loyalty-persist.mjs
 * Штамп лояльности при persist: first complete, неявка, pending→uuid, ккал не из kcal_est.
 */
import { estimateKcalKeytel, HR_SAMPLE_INTERVAL_MS } from '../src/lib/hr/hrSessionAgg.js'
import { pickHrSessionForPersist } from '../src/lib/hr/hrSessionPersistCore.js'
import {
  isTrainingFirstCompletion,
  resolveTrainingPersistStatus,
} from '../src/lib/trainingPersistStatusCore.js'
import {
  applyLoyaltyOnTrainingPersist,
  ensureLoyaltySessionStartedAt,
  resolveLoyaltyCompleteCaps,
} from '../src/lib/loyalty/loyaltyPersistCore.js'
import { isLoyaltyNoShowTraining } from '../src/lib/loyalty/loyaltyTrainingEligibleCore.js'
import { computeLoyaltyKcal } from '../src/lib/loyalty/loyaltyKcalCore.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const HEALTH = { birthDate: '1990-01-15', sex: 'male', weightKg: 80, asOfIso: '2026-09-03' }
const START = '2026-09-03T10:00:00.000Z'
const DONE = '2026-09-03T11:05:00.000Z'
const startMs = Date.parse(START)

ok(
  ensureLoyaltySessionStartedAt(START, DONE) === new Date(Date.parse(START)).toISOString(),
  '1 повторный штамп старта не меняется (pending→uuid)',
)
ok(
  ensureLoyaltySessionStartedAt(null, START) === new Date(Date.parse(START)).toISOString(),
  '1b пустой → берём now',
)

{
  const draft = applyLoyaltyOnTrainingPersist({
    data: { exercises: [] },
    type: 'Силовая',
    firstCompletion: false,
    nowIso: START,
  })
  ok(
    draft.loyalty?.session_started_at && !draft.loyalty.completed_at && draft.loyalty.kcal == null,
    '2 черновик — только session_started_at',
  )
}

{
  const samples = [{ t: startMs + 60 * 1000, bpm: 150 }]
  const data = applyLoyaltyOnTrainingPersist({
    data: { loyalty: { session_started_at: START }, hr_session: { kcal_est: 9999 } },
    type: 'Силовая',
    firstCompletion: true,
    nowIso: DONE,
    samples,
    health: HEALTH,
  })
  const expectKcal = computeLoyaltyKcal({
    samples,
    sessionStartedAt: START,
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 800,
  })
  ok(data.loyalty?.completed_at === new Date(Date.parse(DONE)).toISOString(), '3a completed_at на first complete')
  ok(data.loyalty?.session_started_at === new Date(Date.parse(START)).toISOString(), '3b start сохранён')
  ok(data.loyalty?.kcal === expectKcal, '3c ккал из сэмплов окна')
  ok(data.loyalty?.kcal !== 9999, '3d не копируем hr_session.kcal_est')
  ok(data.hr_session?.kcal_est === 9999, '3e снимок пульса дневника не трогаем')
}

{
  const first = applyLoyaltyOnTrainingPersist({
    data: { loyalty: { session_started_at: START } },
    type: 'Силовая',
    firstCompletion: true,
    nowIso: DONE,
    samples: [],
    health: HEALTH,
  })
  ok(first.loyalty?.kcal === 0 && first.loyalty?.completed_at, '4 нет сэмплов — kcal 0, визит жив')
}

{
  const stored = {
    session_started_at: START,
    completed_at: DONE,
    kcal: 12,
  }
  const edit = applyLoyaltyOnTrainingPersist({
    data: { loyalty: stored, membership_id: 'm-pz' },
    type: 'Силовая',
    firstCompletion: false,
    nowIso: '2026-09-03T18:00:00.000Z',
    samples: [
      { t: startMs, bpm: 190 },
      { t: startMs + 50 * 60 * 1000, bpm: 190 },
    ],
    health: HEALTH,
  })
  ok(edit.loyalty?.kcal === 12 && edit.loyalty?.completed_at === stored.completed_at, '5 повтор complete не пересчитывает ккал')
  ok(edit.membership_id === 'm-pz', '5b membership_id не трогаем')
}

{
  const noshow = applyLoyaltyOnTrainingPersist({
    data: {
      loyalty: { session_started_at: START },
      is_writeoff: true,
      training_focus: 'Списание (неявка)',
    },
    type: 'Силовая',
    firstCompletion: true,
    nowIso: DONE,
    samples: [{ t: startMs, bpm: 150 }],
    health: HEALTH,
  })
  ok(!noshow.loyalty, '6 неявка is_writeoff — штампа нет')
}

{
  const byType = applyLoyaltyOnTrainingPersist({
    data: { loyalty: { session_started_at: START } },
    type: 'Списание',
    firstCompletion: true,
    nowIso: DONE,
    samples: [{ t: startMs, bpm: 150 }],
    health: HEALTH,
  })
  ok(!byType.loyalty, '7 type Списание — штампа нет')
}

ok(
  isLoyaltyNoShowTraining({
    type: 'Силовая',
    data: { training_focus: 'Списание (неявка)' },
  }),
  '7b focus без is_writeoff — неявка',
)

{
  const pendingStart = ensureLoyaltySessionStartedAt(null, START)
  const afterUuid = applyLoyaltyOnTrainingPersist({
    data: { loyalty: { session_started_at: pendingStart } },
    type: 'Силовая',
    firstCompletion: true,
    nowIso: DONE,
    samples: [],
    health: HEALTH,
  })
  ok(afterUuid.loyalty?.session_started_at === pendingStart, '8 uuid save — тот же session_started_at')
}

{
  const noHealth = applyLoyaltyOnTrainingPersist({
    data: { loyalty: { session_started_at: START } },
    type: 'Силовая',
    firstCompletion: true,
    nowIso: DONE,
    samples: [{ t: startMs + 1000, bpm: 150 }],
    health: { birthDate: '', sex: '', weightKg: 0 },
  })
  ok(noHealth.loyalty?.kcal === 0 && noHealth.loyalty?.completed_at, '9 нет здоровья — kcal 0, штамп complete есть')
}

{
  const caps = resolveLoyaltyCompleteCaps({ max_minutes: 1, max_kcal_per_training: 3 })
  ok(caps.maxMinutes === 1 && caps.maxKcal === 3, '10a живые caps с настроек')
  const def = resolveLoyaltyCompleteCaps(null)
  ok(def.maxMinutes === 60 && def.maxKcal === 800, '10b без настроек — 60/800')
  const samples = [
    { t: startMs, bpm: 160 },
    { t: startMs + 50 * 60 * 1000, bpm: 160 },
  ]
  const capped = applyLoyaltyOnTrainingPersist({
    data: { loyalty: { session_started_at: START } },
    type: 'Силовая',
    firstCompletion: true,
    nowIso: DONE,
    samples,
    health: HEALTH,
    settings: { enabled: true, max_minutes: 1, max_kcal_per_training: 800 },
  })
  const expectCapped = computeLoyaltyKcal({
    samples,
    sessionStartedAt: START,
    health: HEALTH,
    maxMinutes: 1,
    maxKcal: 800,
  })
  const uncapped = computeLoyaltyKcal({
    samples,
    sessionStartedAt: START,
    health: HEALTH,
    maxMinutes: 60,
    maxKcal: 800,
  })
  ok(capped.loyalty?.kcal === expectCapped && expectCapped < uncapped, '10c окно 1 мин режет хвост сэмплов')
}

{
  const prev = 'draft'
  const next = resolveTrainingPersistStatus('completed', prev)
  ok(isTrainingFirstCompletion(prev, next) === true, '11 firstCompletion draft→completed')
  ok(isTrainingFirstCompletion('completed', 'completed') === false, '11b повтор не first')
  ok(resolveTrainingPersistStatus('draft', 'completed') === 'completed', '11c completed не откатывается')
}

{
  const live = { avg: 140, min: 110, max: 170, samples_n: 12, duration_sec: 600, kcal_est: 400 }
  const hrFirst = pickHrSessionForPersist({ firstCompletion: true, liveSummary: live, storedSnapshot: null })
  const loyalty = applyLoyaltyOnTrainingPersist({
    data: { loyalty: { session_started_at: START }, hr_session: hrFirst },
    type: 'Силовая',
    firstCompletion: true,
    nowIso: DONE,
    samples: [{ t: startMs, bpm: 150 }],
    health: HEALTH,
  })
  const oneSample = estimateKcalKeytel({
    avgBpm: 150,
    weightKg: 80,
    ageYears: 36,
    sex: 'male',
    durationMin: HR_SAMPLE_INTERVAL_MS / 60000,
  })
  ok(loyalty.hr_session?.kcal_est === 400, '12 HR persist рядом, не внутри loyalty')
  ok(loyalty.loyalty?.kcal === oneSample, '12b loyalty.kcal = Keytel 5с, не kcal_est')
}

{
  const empty = applyLoyaltyOnTrainingPersist({})
  ok(empty && typeof empty === 'object' && !empty.loyalty?.completed_at, '13 пустой persist не бросает')
}

{
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const page = readFileSync(join(root, 'src/pages/trainer/TrainingPage.jsx'), 'utf8')
  ok(/loadLoyaltyCompleteSettings/.test(page), '14 complete грузит живые ставки клуба')
  ok(/settings: loyaltySettings/.test(page), '14b не хардкод settings: null')
  const sql = readFileSync(join(root, 'supabase/schema.sql'), 'utf8')
  ok(/loyalty_ledger_cycle_open_uniq/.test(sql), '14c schema.sql уникальный cycle_open')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nloyalty persist verify ok')
