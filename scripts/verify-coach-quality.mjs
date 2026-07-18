/**
 * Качество ведения тренера — техническая и логическая проверка
 * (взгляд тренера и управляющего).
 *
 * node scripts/verify-coach-quality.mjs
 */
import {
  areBodyMeasuresApplicable,
  clientNeedsNutritionPlan,
  coachQualityRulesHelp,
  computeCoachQualityScorePct,
  daysWithoutUsableMembership,
  evaluateBagFlag,
  evaluateHealthPassportFlag,
  evaluateMeasuresCareFlag,
  evaluateNutritionCareFlag,
  isThinCompletedTraining,
  nutritionStaleDays,
  resolveCoachQualityStatus,
  COACH_QUALITY_AXIS_LABELS,
  COACH_QUALITY_CARE_OK,
  COACH_QUALITY_CARE_WARN,
  COACH_QUALITY_DEPTH_BAD,
  COACH_QUALITY_DEPTH_OK,
  COACH_QUALITY_INACTIVE_GRACE_DAYS,
  COACH_QUALITY_MIN_ACTIVE_CLIENTS,
  COACH_QUALITY_MIN_COMPLETED,
  COACH_QUALITY_NUTRITION_STALE_GRACE_DAYS,
  COACH_QUALITY_STUCK_DAYS,
  COACH_QUALITY_STATUS_LABELS,
} from '../src/lib/admin/coachQualityCore.js'
import { aggregateCoachQuality, indexMeasurementsByClient, indexWeightEntriesByClient } from '../src/lib/admin/coachQualityAgg.js'
import {
  defaultCoachQualityConfig,
  normalizeCoachQualityConfig,
} from '../src/lib/admin/coachQualityConfigCore.js'

let failed = 0
let section = ''

function ok(cond, msg) {
  const full = section ? `[${section}] ${msg}` : msg
  if (cond) console.log(`ok: ${full}`)
  else {
    console.error(`FAIL: ${full}`)
    failed++
  }
}

function setSection(name) {
  section = name
  console.log(`\n--- ${name} ---`)
}

const TODAY = '2026-07-18'
const FROM = '2026-07-01'
const TO = '2026-07-18'

const TYPES = [
  { id: 'paid', code: 'ДК', name: 'ДК' },
  { id: 'bz', code: 'БЗ', name: 'БЗ', is_pnk_trial: true },
]

function deepData() {
  return {
    exercises: [
      { catalog_exercise_id: 'e1', sets: [{ reps: '10' }, { reps: '8' }] },
      { catalog_exercise_id: 'e2', sets: [{ reps: '12' }, { weight_kg: '40' }] },
    ],
  }
}

function thinData() {
  return {
    exercises: [{ catalog_exercise_id: 'e1', sets: [{ reps: '10' }] }],
  }
}

function paidMem(clientId, endDate, extra = {}) {
  return {
    client_id: clientId,
    start_date: '2026-01-01',
    end_date: endDate,
    total_trainings: 12,
    used_trainings: 12,
    membership_type_id: 'paid',
    ...extra,
  }
}

function usablePaid(clientId) {
  return {
    client_id: clientId,
    start_date: '2026-06-01',
    end_date: '2026-08-31',
    total_trainings: 12,
    used_trainings: 3,
    membership_type_id: 'paid',
  }
}

function bzMem(clientId, endDate) {
  return {
    client_id: clientId,
    start_date: '2026-05-01',
    end_date: endDate,
    total_trainings: 1,
    used_trainings: 1,
    membership_type_id: 'bz',
  }
}

function completed(id, trainerId, clientId, date, data) {
  return {
    id,
    trainer_id: trainerId,
    client_id: clientId,
    date,
    status: 'completed',
    data,
  }
}

function healthOk(extra = {}) {
  return {
    height_cm: 170,
    current_weight_kg: 70,
    initial_weight_kg: 70,
    sex: 'female',
    health_filled_at: '2026-01-01',
    goal: 'сила',
    nutrition_plan: { basis: { weightKg: 70, heightCm: 170 }, meals: [] },
    ...extra,
  }
}

function healthStalePlan(currentKg = 78, basisKg = 80) {
  return {
    height_cm: 170,
    current_weight_kg: currentKg,
    initial_weight_kg: basisKg,
    sex: 'female',
    health_filled_at: '2026-01-01',
    goal: 'похудение',
    nutrition_plan: { basis: { weightKg: basisKg, heightCm: 170 }, meals: [] },
  }
}

// ─── TECH ───────────────────────────────────────────────────────────
setSection('TECH / глубина записи')

ok(isThinCompletedTraining(null), 'null workout = thin')
ok(isThinCompletedTraining({}), 'empty object = thin')
ok(isThinCompletedTraining({ exercises: [] }), 'empty exercises = thin')
ok(isThinCompletedTraining({ exercises: [{ catalog_exercise_id: 'e1', sets: [] }] }), 'exercise without sets = thin')
ok(
  isThinCompletedTraining({
    exercises: [{ name: 'без id', sets: [{ reps: '10' }, { reps: '8' }, { reps: '6' }] }],
  }),
  'sets without catalog_exercise_id = thin',
)
ok(isThinCompletedTraining(thinData()), '1 exercise = thin')
ok(
  isThinCompletedTraining({
    exercises: [
      { catalog_exercise_id: 'e1', sets: [{ reps: '10' }] },
      { catalog_exercise_id: 'e2', sets: [{ reps: '8' }] },
    ],
  }),
  '2 exercises but ≤2 set-rows = thin',
)
ok(!isThinCompletedTraining(deepData()), '2+ exercises with enough sets = deep')

setSection('TECH / обмеры применимость')

ok(areBodyMeasuresApplicable({ goal: 'Похудение' }, false), 'goal похудение')
ok(areBodyMeasuresApplicable({ goal: 'рекомпозиция' }, false), 'goal рекомпозиция')
ok(areBodyMeasuresApplicable({ goal: 'сушка' }, false), 'goal сушка')
ok(!areBodyMeasuresApplicable({ goal: 'сила' }, false), 'goal сила без истории — не применимо')
ok(!areBodyMeasuresApplicable({ goal: '' }, false), 'пустая цель без истории')
ok(areBodyMeasuresApplicable({ goal: 'сила' }, true), 'история обмеров → применимо')
ok(areBodyMeasuresApplicable(null, true), 'null health + история → применимо')

setSection('TECH / паспорт здоровья F0')

ok(evaluateHealthPassportFlag(null).critical, 'нет карты — F0')
ok(evaluateHealthPassportFlag({ height_cm: 170 }).critical, 'неполная карта — F0')
ok(!evaluateHealthPassportFlag(healthOk()).critical, 'полная карта — не F0')

setSection('TECH / рацион F1')

ok(
  !clientNeedsNutritionPlan({ goal: 'сила', current_weight_kg: null, initial_weight_kg: null }),
  'сила без веса — рацион не обязателен',
)
ok(clientNeedsNutritionPlan({ goal: 'похудение' }), 'похудение — рацион нужен')
ok(
  evaluateNutritionCareFlag(
    {
      height_cm: 170,
      goal: 'сила',
      sex: 'male',
      health_filled_at: '2026-01-01',
      initial_weight_kg: null,
      current_weight_kg: null,
      nutrition_plan: null,
    },
    [],
    TODAY,
  ).critical === false,
  'сила без веса и без плана — не F1',
)
ok(
  evaluateNutritionCareFlag(healthOk({ nutrition_plan: null, goal: 'похудение' }), [], TODAY).critical === true,
  'похудение без плана — F1 missing',
)
ok(
  evaluateNutritionCareFlag(healthOk({ nutrition_plan: null }), [], TODAY).critical === true,
  'есть вес в карте без плана — F1 missing',
)
ok(
  evaluateNutritionCareFlag(
    {
      ...healthStalePlan(),
      nutrition_plan: { basis: { weightKg: 78, heightCm: 170 } },
      current_weight_kg: 78,
    },
    [],
    TODAY,
  ).critical === false,
  'вес = basis — не stale',
)

const daysLong = nutritionStaleDays(
  healthStalePlan(78, 80),
  healthStalePlan(78, 80).nutrition_plan,
  [{ date: '2026-06-01', weight_kg: 78 }],
  TODAY,
)
ok(daysLong != null && daysLong > COACH_QUALITY_NUTRITION_STALE_GRACE_DAYS, `stale days > ${COACH_QUALITY_NUTRITION_STALE_GRACE_DAYS}`)

const f1 = evaluateNutritionCareFlag(healthStalePlan(), [{ date: '2026-06-01', weight_kg: 78 }], TODAY)
ok(f1.critical, 'F1 critical после долгого stale')
ok(String(f1.reason ?? '').length > 0, 'F1 имеет reason')

const f1grace = evaluateNutritionCareFlag(healthStalePlan(), [{ date: '2026-07-15', weight_kg: 78 }], TODAY)
ok(!f1grace.critical, 'F1 в льготе 7 дней — не critical')

const f1unknown = evaluateNutritionCareFlag(healthStalePlan(), [], TODAY)
ok(f1unknown.critical, 'stale без даты смены веса — critical (консервативно)')

setSection('TECH / обмеры F2')

ok(
  !evaluateMeasuresCareFlag({ goal: '' }, null, FROM, false).critical,
  'F2 не ставим без применимости',
)
ok(
  evaluateMeasuresCareFlag({ goal: 'сушка' }, '2026-06-01', FROM, true).critical,
  'F2: замер до периода',
)
ok(
  !evaluateMeasuresCareFlag({ goal: 'сушка' }, '2026-07-05', FROM, true).critical,
  'F2: замер в периоде — ок',
)
ok(
  evaluateMeasuresCareFlag({ goal: 'похудение' }, null, FROM, false).critical,
  'F2: цель есть, замеров никогда не было',
)

setSection('TECH / хвосты базы (bag)')

const daysUsable = daysWithoutUsableMembership([usablePaid('c')], TODAY)
ok(daysUsable == null, 'действующий абонемент — не inactive days')

const notStarted = evaluateBagFlag({
  client: { id: 'c', archived_at: null },
  memList: [
    {
      client_id: 'c',
      start_date: '2026-08-01',
      end_date: '2026-09-01',
      total_trainings: 10,
      used_trainings: 0,
      membership_type_id: 'paid',
    },
  ],
  membershipTypes: TYPES,
  todayIso: TODAY,
})
ok(!notStarted.stuck && notStarted.corridor == null, 'not_started — не stuck')

const corridorOk = evaluateBagFlag({
  client: { id: 'c', archived_at: null },
  memList: [paidMem('c', '2026-07-14')],
  membershipTypes: TYPES,
  todayIso: TODAY,
})
ok(
  !corridorOk.stuck &&
    corridorOk.corridor === 'ok' &&
    corridorOk.days != null &&
    corridorOk.days <= COACH_QUALITY_INACTIVE_GRACE_DAYS,
  '0–7 дней в неактивных — коридор ok',
)

const corridorWarn = evaluateBagFlag({
  client: { id: 'c', archived_at: null },
  memList: [paidMem('c', '2026-07-06')],
  membershipTypes: TYPES,
  todayIso: TODAY,
})
ok(
  !corridorWarn.stuck && corridorWarn.corridor === 'warn',
  '8–14 дней — warn, ещё не stuck',
)

const stuckDk = evaluateBagFlag({
  client: { id: 'c', archived_at: null },
  memList: [paidMem('c', '2026-06-01')],
  membershipTypes: TYPES,
  todayIso: TODAY,
})
ok(stuckDk.stuck && stuckDk.kind === 'stuck_dk' && stuckDk.days > COACH_QUALITY_STUCK_DAYS, 'ДК >14 — stuck_dk')

const stuckBz = evaluateBagFlag({
  client: { id: 'c', archived_at: null, lifecycle: 'pnk', pnk_stage: 'followup' },
  memList: [bzMem('c', '2026-06-01')],
  membershipTypes: TYPES,
  todayIso: TODAY,
})
ok(stuckBz.stuck && stuckBz.kind === 'stuck_bz', 'после БЗ без ДК/отказа — stuck_bz')

const bzClosedLost = evaluateBagFlag({
  client: { id: 'c', archived_at: null, lifecycle: 'pnk_lost', pnk_stage: 'lost' },
  memList: [bzMem('c', '2026-06-01')],
  membershipTypes: TYPES,
  todayIso: TODAY,
})
// lost всё ещё без usable — days>14, но afterBz false because pnkClosed → stuck_dk kind
ok(bzClosedLost.stuck, 'lost без архива и без ДК всё ещё inactive >14 — stuck (нужен архив или не держать)')
ok(bzClosedLost.kind === 'stuck_dk', 'закрытый ПНК без paid → kind stuck_dk (не «хвост БЗ»)')

const archived = evaluateBagFlag({
  client: { id: 'c', archived_at: '2026-07-01' },
  memList: [paidMem('c', '2026-06-01')],
  membershipTypes: TYPES,
  todayIso: TODAY,
})
ok(!archived.stuck, 'архив снимает stuck')

const wonWithPaid = evaluateBagFlag({
  client: { id: 'c', archived_at: null, lifecycle: 'active', pnk_stage: 'won' },
  memList: [bzMem('c', '2026-06-01'), usablePaid('c')],
  membershipTypes: TYPES,
  todayIso: TODAY,
})
ok(!wonWithPaid.stuck, 'won + платный ДК — не stuck')

setSection('TECH / статус и направления просадки')

const stOk = resolveCoachQualityStatus({
  carePct: 90,
  depthPct: 80,
  stuckCount: 0,
  bagWarnCount: 0,
  completed: 20,
  activeClients: 5,
})
ok(stOk.status === 'ok' && stOk.failureDirections.length === 0, 'здоровый профиль = ок')

const stCareAtt = resolveCoachQualityStatus({
  carePct: 75,
  depthPct: 80,
  stuckCount: 0,
  bagWarnCount: 0,
  completed: 20,
  activeClients: 5,
})
ok(stCareAtt.status === 'attention' && stCareAtt.failureDirections.includes('care'), 'care 70–84 = внимание + ось care')

const stCareReview = resolveCoachQualityStatus({
  carePct: 60,
  depthPct: 80,
  stuckCount: 0,
  bagWarnCount: 0,
  completed: 20,
  activeClients: 5,
})
ok(stCareReview.status === 'review' && stCareReview.failureDirections.includes('care'), 'care <70 = разбор')

const stDepthAtt = resolveCoachQualityStatus({
  carePct: 90,
  depthPct: 60,
  stuckCount: 0,
  bagWarnCount: 0,
  completed: 20,
  activeClients: 5,
})
ok(stDepthAtt.status === 'attention' && stDepthAtt.failureDirections.includes('depth'), 'depth <70 = внимание')

const stCombo = resolveCoachQualityStatus({
  carePct: 80,
  depthPct: 40,
  stuckCount: 0,
  bagWarnCount: 0,
  completed: 20,
  activeClients: 5,
})
ok(
  stCombo.status === 'review' &&
    stCombo.failureDirections.includes('care') &&
    stCombo.failureDirections.includes('depth'),
  'care слаб + depth <50 = разбор (две оси)',
)

const stBag = resolveCoachQualityStatus({
  carePct: 95,
  depthPct: 95,
  stuckCount: 1,
  bagWarnCount: 0,
  completed: 20,
  activeClients: 5,
})
ok(stBag.status === 'review' && stBag.failureDirections.includes('bag'), 'stuck блокирует «Ок» → разбор')

const stWarnBag = resolveCoachQualityStatus({
  carePct: 95,
  depthPct: 95,
  stuckCount: 0,
  bagWarnCount: 2,
  completed: 20,
  activeClients: 5,
})
ok(stWarnBag.status === 'attention' && stWarnBag.failureDirections.includes('bag'), 'коридор 8–14 = внимание по bag')

const stInsuf = resolveCoachQualityStatus({
  carePct: null,
  depthPct: null,
  stuckCount: 0,
  bagWarnCount: 0,
  completed: COACH_QUALITY_MIN_COMPLETED - 1,
  activeClients: COACH_QUALITY_MIN_ACTIVE_CLIENTS,
})
ok(stInsuf.status === 'insufficient_data', 'мало completed → мало данных')

const stInsufStuck = resolveCoachQualityStatus({
  carePct: null,
  depthPct: null,
  stuckCount: 1,
  bagWarnCount: 0,
  completed: 2,
  activeClients: 1,
})
ok(stInsufStuck.status === 'review' && stInsufStuck.failureDirections.includes('bag'), 'мало данных + stuck → всё равно разбор')

ok(COACH_QUALITY_AXIS_LABELS.care && COACH_QUALITY_STATUS_LABELS.ok, 'подписи осей/статусов для UI')
ok(coachQualityRulesHelp().length >= 4, 'текст правил для тренера и админа')

const scoreFull = computeCoachQualityScorePct({
  carePct: 100,
  depthPct: 80,
  bagPct: 100,
  stuckCount: 0,
  completed: 10,
})
ok(scoreFull === Math.round(100 * 0.4 + 80 * 0.4 + 100 * 0.2), 'итоговый балл = 40/40/20')
const scoreStuck = computeCoachQualityScorePct({
  carePct: 100,
  depthPct: 100,
  bagPct: 100,
  stuckCount: 2,
  completed: 10,
})
ok(scoreStuck === 79, 'stuck → потолок 79')
const scoreIdle = computeCoachQualityScorePct({
  carePct: null,
  depthPct: null,
  bagPct: 100,
  stuckCount: 0,
  completed: 0,
})
ok(scoreIdle == null, '0 тренировок → нет балла (не 100)')
const scoreBagOnly = computeCoachQualityScorePct({
  carePct: null,
  depthPct: null,
  bagPct: 90,
  stuckCount: 0,
  completed: 5,
})
ok(scoreBagOnly === 70, 'есть тренировки без care/depth → потолок 70 по базе')

setSection('TECH / индексы service')

const measIdx = indexMeasurementsByClient([
  { client_id: 'a', date: '2026-07-01' },
  { client_id: 'a', date: '2026-07-10' },
  { client_id: 'b', date: '2026-06-01' },
])
ok(measIdx.lastMeasureByClientId.a === '2026-07-10', 'last measure берёт позднюю дату')
ok(measIdx.hadMeasureEverByClientId.b === true, 'hadMeasureEver')

const wIdx = indexWeightEntriesByClient([
  { client_id: 'a', date: '2026-07-01', weight_kg: 80 },
  { client_id: 'a', date: '2026-07-10', weight_kg: 78 },
])
ok(wIdx.a?.length === 2, 'weight entries сгруппированы по клиенту')

// ─── COACH VIEW ─────────────────────────────────────────────────────
setSection('COACH / тонкий дневник бьёт глубину')

{
  const deepN = 7
  const thinN = 5
  const trainings = []
  const clientIds = ['c1', 'c2', 'c3']
  for (let i = 0; i < deepN; i++) {
    const cid = clientIds[i % clientIds.length]
    trainings.push(completed(`d${i}`, 'me', cid, `2026-07-${String(10 + (i % 5)).padStart(2, '0')}`, deepData()))
  }
  for (let i = 0; i < thinN; i++) {
    const cid = clientIds[i % clientIds.length]
    trainings.push(completed(`t${i}`, 'me', cid, `2026-07-${String(5 + i).padStart(2, '0')}`, thinData()))
  }
  const agg = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: clientIds.map((id) => ({ id, trainer_id: 'me', name: id, archived_at: null })),
    trainings,
    memberships: clientIds.map((id) => usablePaid(id)),
    membershipTypes: TYPES,
    healthByClientId: Object.fromEntries(clientIds.map((id) => [id, healthOk()])),
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  const me = agg.trainers.find((t) => t.trainerId === 'me')
  ok(me?.completed === deepN + thinN, 'тренер видит все свои completed')
  ok(me?.minimalCompleted === thinN, 'считаются тонкие')
  const expectDepth = Math.round((100 * deepN) / (deepN + thinN))
  ok(me?.depthPct === expectDepth, `depth_pct=${expectDepth} при доле тонких`)
  ok(me?.depthPct < COACH_QUALITY_DEPTH_OK, 'конвейер тонких → depth ниже нормы')
  ok(me?.activeClients >= COACH_QUALITY_MIN_ACTIVE_CLIENTS, 'достаточно активных для сравнения depth')
  ok(
    me?.failureDirections.includes('depth') || me?.status === 'attention' || me?.status === 'review',
    'просадка depth видна тренеру',
  )
}

setSection('COACH / stale рацион у активного')

{
  const agg = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: [
      { id: 'c1', trainer_id: 'me', name: 'Иванов', archived_at: null },
      { id: 'c2', trainer_id: 'me', name: 'Петров', archived_at: null },
      { id: 'c3', trainer_id: 'me', name: 'Сидоров', archived_at: null },
    ],
    trainings: [
      completed('1', 'me', 'c1', '2026-07-05', deepData()),
      completed('2', 'me', 'c2', '2026-07-06', deepData()),
      completed('3', 'me', 'c3', '2026-07-07', deepData()),
      completed('4', 'me', 'c1', '2026-07-08', deepData()),
      completed('5', 'me', 'c2', '2026-07-09', deepData()),
      completed('6', 'me', 'c3', '2026-07-10', deepData()),
      completed('7', 'me', 'c1', '2026-07-11', deepData()),
      completed('8', 'me', 'c2', '2026-07-12', deepData()),
      completed('9', 'me', 'c3', '2026-07-13', deepData()),
    ],
    memberships: [usablePaid('c1'), usablePaid('c2'), usablePaid('c3')],
    membershipTypes: TYPES,
    healthByClientId: {
      c1: healthStalePlan(),
      c2: healthOk(),
      c3: healthOk(),
    },
    weightEntriesByClientId: {
      c1: [{ date: '2026-06-01', weight_kg: 78 }],
    },
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  const me = agg.trainers.find((t) => t.trainerId === 'me')
  ok(me?.activeClients === 3, '3 активных')
  ok(me?.criticalClients === 1 && me?.staleCount === 1, 'один F1 stale')
  ok(me?.carePct === Math.round((100 * 2) / 3), 'care_pct = 2/3 без критичных')
  ok(me?.facts.some((f) => f.kind === 'f1_nutrition_stale' && f.clientName === 'Иванов'), 'факт с именем клиента')
  ok(me?.failureDirections.includes('care') || me?.carePct < COACH_QUALITY_CARE_OK, 'тренер видит просадку ведения')
}

setSection('COACH / обмеры и «не штрафуем зря»')

{
  const agg = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: [
      { id: 'force', trainer_id: 'me', name: 'Силач', archived_at: null },
      { id: 'cut', trainer_id: 'me', name: 'Сушка', archived_at: null },
    ],
    trainings: [
      completed('1', 'me', 'force', '2026-07-05', deepData()),
      completed('2', 'me', 'cut', '2026-07-06', deepData()),
      completed('3', 'me', 'force', '2026-07-07', deepData()),
      completed('4', 'me', 'cut', '2026-07-08', deepData()),
      completed('5', 'me', 'force', '2026-07-09', deepData()),
      completed('6', 'me', 'cut', '2026-07-10', deepData()),
      completed('7', 'me', 'force', '2026-07-11', deepData()),
      completed('8', 'me', 'cut', '2026-07-12', deepData()),
      completed('9', 'me', 'force', '2026-07-13', deepData()),
    ],
    memberships: [usablePaid('force'), usablePaid('cut')],
    membershipTypes: TYPES,
    healthByClientId: {
      force: healthOk({ goal: 'сила' }),
      cut: healthOk({ goal: 'сушка' }),
    },
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  const me = agg.trainers.find((t) => t.trainerId === 'me')
  ok(me?.missingMeasuresCount === 1, 'F2 только у «сушка», не у «сила»')
  ok(
    me?.facts.some((f) => f.kind === 'f2_measures' && f.clientId === 'cut') &&
      !me?.facts.some((f) => f.clientId === 'force' && f.kind === 'f2_measures'),
    'силач без обмеров не в фактах F2',
  )
}

setSection('COACH / хвост в неактивных и архив')

{
  const aggStuck = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: [{ id: 'hang', trainer_id: 'me', name: 'Висит', archived_at: null }],
    trainings: [completed('1', 'me', 'hang', '2026-07-02', deepData())],
    memberships: [paidMem('hang', '2026-06-01')],
    membershipTypes: TYPES,
    healthByClientId: { hang: healthOk() },
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  const me = aggStuck.trainers.find((t) => t.trainerId === 'me')
  ok(me?.stuckCount === 1 && me?.stuckDk === 1, 'долго в неактивных = stuck ДК')
  ok(me?.status === 'review', 'тренер видит «Разбор» из‑за хвоста')
  ok(me?.failureDirectionLabels?.some((l) => /Неактивн/i.test(l)), 'подпись оси bag на русском')

  const aggArch = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: [{ id: 'hang', trainer_id: 'me', name: 'В архиве', archived_at: '2026-07-10' }],
    trainings: [completed('1', 'me', 'hang', '2026-07-02', deepData())],
    memberships: [paidMem('hang', '2026-06-01')],
    membershipTypes: TYPES,
    healthByClientId: {},
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  const me2 = aggArch.trainers.find((t) => t.trainerId === 'me')
  ok(me2?.stuckCount === 0, 'после архива stuck исчезает — работа закрыта')
}

setSection('COACH / после БЗ')

{
  const agg = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: [
      {
        id: 'pnk1',
        trainer_id: 'me',
        name: 'ПНК хвост',
        archived_at: null,
        lifecycle: 'pnk',
        pnk_stage: 'followup',
      },
    ],
    trainings: [],
    memberships: [bzMem('pnk1', '2026-06-01')],
    membershipTypes: TYPES,
    healthByClientId: {},
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  const me = agg.trainers.find((t) => t.trainerId === 'me')
  ok(me?.stuckBz === 1, 'хвост после БЗ виден тренеру')
  ok(me?.facts.some((f) => f.kind === 'stuck_bz'), 'факт stuck_bz')
}

setSection('COACH / списание ≠ минус; мало данных')

{
  const agg = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: [{ id: 'c1', trainer_id: 'me', name: 'Новичок база', archived_at: null }],
    trainings: [
      completed('1', 'me', 'c1', '2026-07-10', deepData()),
      completed('2', 'me', 'c1', '2026-07-12', deepData()),
    ],
    memberships: [usablePaid('c1')],
    membershipTypes: TYPES,
    healthByClientId: { c1: healthOk() },
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  const me = agg.trainers.find((t) => t.trainerId === 'me')
  ok(me?.completed === 2 && me?.status === 'insufficient_data', 'мало тренировок — не судим care/depth')
  ok(me?.stuckCount === 0 && me?.failureDirections.length === 0, 'при живом ДК нет ложного минуса за списание')
}

// ─── MANAGER VIEW ───────────────────────────────────────────────────
setSection('MANAGER / два тренера: образец vs разбор')

{
  const clients = [
    { id: 'g1', trainer_id: 'good', name: 'G1', archived_at: null },
    { id: 'g2', trainer_id: 'good', name: 'G2', archived_at: null },
    { id: 'g3', trainer_id: 'good', name: 'G3', archived_at: null },
    { id: 'b1', trainer_id: 'bad', name: 'B1', archived_at: null },
    { id: 'b2', trainer_id: 'bad', name: 'B2', archived_at: null },
    { id: 'b3', trainer_id: 'bad', name: 'B3', archived_at: null },
  ]
  const trainings = []
  for (const cid of ['g1', 'g2', 'g3']) {
    for (let i = 0; i < 4; i++) {
      trainings.push(completed(`g-${cid}-${i}`, 'good', cid, `2026-07-${String(5 + i).padStart(2, '0')}`, deepData()))
    }
  }
  for (const cid of ['b1', 'b2', 'b3']) {
    for (let i = 0; i < 4; i++) {
      trainings.push(completed(`b-${cid}-${i}`, 'bad', cid, `2026-07-${String(5 + i).padStart(2, '0')}`, thinData()))
    }
  }
  const agg = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients,
    trainings,
    memberships: [
      usablePaid('g1'),
      usablePaid('g2'),
      usablePaid('g3'),
      paidMem('b1', '2026-06-01'),
      paidMem('b2', '2026-06-01'),
      paidMem('b3', '2026-06-01'),
    ],
    membershipTypes: TYPES,
    healthByClientId: {
      g1: healthOk(),
      g2: healthOk(),
      g3: healthOk(),
      b1: healthStalePlan(),
      b2: healthOk({ goal: 'сушка' }),
      b3: healthOk(),
    },
    weightEntriesByClientId: {
      b1: [{ date: '2026-06-01', weight_kg: 78 }],
    },
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })

  ok(agg.trainers.length === 2, 'управляющий видит обоих тренеров')
  const good = agg.trainers.find((t) => t.trainerId === 'good')
  const bad = agg.trainers.find((t) => t.trainerId === 'bad')
  ok(good?.status === 'ok' || good?.status === 'attention', 'сильный тренер не в разборе без хвостов')
  ok(good?.stuckCount === 0, 'у сильного нет stuck')
  ok(bad?.status === 'review', 'слабый тренер — разбор')
  ok(bad?.stuckCount >= 1, 'у слабого хвосты базы')
  ok(bad?.failureDirections.includes('bag'), 'управляющий видит ось bag')
  ok(
    (agg.statusCounts.review ?? 0) >= 1 && (agg.statusCounts.ok ?? 0) + (agg.statusCounts.attention ?? 0) >= 1,
    'сводка клуба: есть разбор и не-разбор',
  )
  ok(agg.trainers[0].trainerId === 'bad', 'сортировка: разбор выше в списке для управляющего')
}

setSection('MANAGER / фильтр одного тренера и медиана')

{
  const aggAll = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: [
      { id: 'a1', trainer_id: 't1', name: 'A', archived_at: null },
      { id: 'a2', trainer_id: 't1', name: 'A2', archived_at: null },
      { id: 'a3', trainer_id: 't1', name: 'A3', archived_at: null },
      { id: 'b1', trainer_id: 't2', name: 'B', archived_at: null },
      { id: 'b2', trainer_id: 't2', name: 'B2', archived_at: null },
      { id: 'b3', trainer_id: 't2', name: 'B3', archived_at: null },
    ],
    trainings: [
      ...['a1', 'a2', 'a3'].flatMap((cid, i) =>
        [0, 1, 2].map((j) =>
          completed(`t1-${cid}-${j}`, 't1', cid, `2026-07-${String(8 + j).padStart(2, '0')}`, deepData()),
        ),
      ),
      ...['b1', 'b2', 'b3'].flatMap((cid) =>
        [0, 1, 2].map((j) =>
          completed(`t2-${cid}-${j}`, 't2', cid, `2026-07-${String(8 + j).padStart(2, '0')}`, deepData()),
        ),
      ),
    ],
    memberships: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map((id) => usablePaid(id)),
    membershipTypes: TYPES,
    healthByClientId: {
      a1: healthOk(),
      a2: healthOk(),
      a3: healthOk(),
      b1: healthStalePlan(),
      b2: healthStalePlan(),
      b3: healthOk(),
    },
    weightEntriesByClientId: {
      b1: [{ date: '2026-06-01', weight_kg: 78 }],
      b2: [{ date: '2026-06-01', weight_kg: 78 }],
    },
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  ok(aggAll.medianCarePct != null, 'медиана ведения по клубу считается')
  ok(aggAll.averageScorePct != null, 'средний балл по клубу считается')
  ok(Number.isFinite(aggAll.averageScorePct), 'средний балл — число')

  const onlyT2 = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    trainerIdFilter: 't2',
    clients: aggAll.trainers.length
      ? [
          { id: 'a1', trainer_id: 't1', name: 'A', archived_at: null },
          { id: 'b1', trainer_id: 't2', name: 'B', archived_at: null },
          { id: 'b2', trainer_id: 't2', name: 'B2', archived_at: null },
          { id: 'b3', trainer_id: 't2', name: 'B3', archived_at: null },
        ]
      : [],
    trainings: [
      completed('x1', 't2', 'b1', '2026-07-08', deepData()),
      completed('x2', 't2', 'b2', '2026-07-09', deepData()),
      completed('x3', 't2', 'b3', '2026-07-10', deepData()),
      completed('x4', 't1', 'a1', '2026-07-11', deepData()),
    ],
    memberships: [usablePaid('a1'), usablePaid('b1'), usablePaid('b2'), usablePaid('b3')],
    membershipTypes: TYPES,
    healthByClientId: {
      b1: healthStalePlan(),
      b2: healthStalePlan(),
      b3: healthOk(),
      a1: healthOk(),
    },
    weightEntriesByClientId: {
      b1: [{ date: '2026-06-01', weight_kg: 78 }],
      b2: [{ date: '2026-06-01', weight_kg: 78 }],
    },
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  ok(onlyT2.trainers.length === 1 && onlyT2.trainers[0].trainerId === 't2', 'фильтр trainerId — как drill-down управляющего')
  ok(onlyT2.trainers[0].staleCount === 2, 'в drill-down видны F1 только этого тренера')
}

setSection('MANAGER / одинаковый объём, разное ведение')

{
  // Стресс-тест №1 из промпта: одинаковое число completed, разный care
  const makeTrainings = (tid, cids) =>
    cids.flatMap((cid, idx) =>
      [0, 1, 2, 3].map((j) =>
        completed(`${tid}-${cid}-${j}`, tid, cid, `2026-07-${String(4 + j).padStart(2, '0')}`, deepData()),
      ),
    )
  const agg = aggregateCoachQuality({
    dateFrom: FROM,
    dateTo: TO,
    todayIso: TODAY,
    clients: [
      { id: 'c1', trainer_id: 'alpha', name: 'C1', archived_at: null },
      { id: 'c2', trainer_id: 'alpha', name: 'C2', archived_at: null },
      { id: 'c3', trainer_id: 'alpha', name: 'C3', archived_at: null },
      { id: 'd1', trainer_id: 'beta', name: 'D1', archived_at: null },
      { id: 'd2', trainer_id: 'beta', name: 'D2', archived_at: null },
      { id: 'd3', trainer_id: 'beta', name: 'D3', archived_at: null },
    ],
    trainings: [...makeTrainings('alpha', ['c1', 'c2', 'c3']), ...makeTrainings('beta', ['d1', 'd2', 'd3'])],
    memberships: ['c1', 'c2', 'c3', 'd1', 'd2', 'd3'].map((id) => usablePaid(id)),
    membershipTypes: TYPES,
    healthByClientId: {
      c1: healthOk(),
      c2: healthOk(),
      c3: healthOk(),
      d1: healthStalePlan(),
      d2: healthStalePlan(),
      d3: healthStalePlan(),
    },
    weightEntriesByClientId: {
      d1: [{ date: '2026-06-01', weight_kg: 78 }],
      d2: [{ date: '2026-06-01', weight_kg: 78 }],
      d3: [{ date: '2026-06-01', weight_kg: 78 }],
    },
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
  })
  const alpha = agg.trainers.find((t) => t.trainerId === 'alpha')
  const beta = agg.trainers.find((t) => t.trainerId === 'beta')
  ok(alpha?.completed === beta?.completed, 'одинаковый объём completed')
  ok((alpha?.carePct ?? 0) > (beta?.carePct ?? 100), 'управляющий отличает ведение при равном объёме')
  ok(beta?.failureDirections.includes('care'), 'у beta просадка care')
}

setSection('MANAGER / пороги констант согласованы')

ok(COACH_QUALITY_CARE_WARN < COACH_QUALITY_CARE_OK, 'care warn < ok')
ok(COACH_QUALITY_DEPTH_BAD < COACH_QUALITY_DEPTH_OK, 'depth bad < ok')
ok(COACH_QUALITY_INACTIVE_GRACE_DAYS < COACH_QUALITY_STUCK_DAYS, 'grace < stuck days')
ok(COACH_QUALITY_MIN_COMPLETED >= 1 && COACH_QUALITY_MIN_ACTIVE_CLIENTS >= 1, 'пороги мало данных заданы')

setSection('MANAGER / конфиг клуба: веса и тумблеры')

const def = defaultCoachQualityConfig()
ok(def.weightCare + def.weightDepth + def.weightBag === 100, 'дефолт веса = 100%')
const norm = normalizeCoachQualityConfig({ weightCare: 50, weightDepth: 50, weightBag: 50 })
ok(norm.weightCare + norm.weightDepth + norm.weightBag === 100, 'нормализация весов к 100%')
ok(norm.weightCare === 33 && norm.weightDepth === 33 && norm.weightBag === 34, 'равные веса → 33/33/34')

const offCare = aggregateCoachQuality({
  dateFrom: FROM,
  dateTo: TO,
  todayIso: TODAY,
  config: {
    ...def,
    toggleHealthPassport: false,
    toggleNutritionMissing: false,
    toggleNutritionStale: false,
    toggleMeasures: false,
  },
  clients: [
    { id: 'c1', trainer_id: 't1', name: 'C1', archived_at: null },
    { id: 'c2', trainer_id: 't1', name: 'C2', archived_at: null },
    { id: 'c3', trainer_id: 't1', name: 'C3', archived_at: null },
  ],
  trainings: [
    completed('a', 't1', 'c1', '2026-07-02', deepData()),
    completed('b', 't1', 'c2', '2026-07-03', deepData()),
    completed('c', 't1', 'c3', '2026-07-04', deepData()),
    completed('d', 't1', 'c1', '2026-07-05', deepData()),
    completed('e', 't1', 'c2', '2026-07-06', deepData()),
    completed('f', 't1', 'c3', '2026-07-07', deepData()),
    completed('g', 't1', 'c1', '2026-07-08', deepData()),
    completed('h', 't1', 'c2', '2026-07-09', deepData()),
  ],
  memberships: [usablePaid('c1'), usablePaid('c2'), usablePaid('c3')],
  membershipTypes: TYPES,
  healthByClientId: {},
  lastMeasureByClientId: {},
  hadMeasureEverByClientId: {},
  weightEntriesByClientId: {},
})
ok(offCare.trainers[0]?.carePct === 100, 'все тумблеры ведения выкл → care 100% при пустых картах')
ok(offCare.trainers[0]?.scorePct === 100, 'при глубине 100 и базе 100 → балл 100')

const depthHeavy = computeCoachQualityScorePct(
  { carePct: 0, depthPct: 100, bagPct: 100, stuckCount: 0, completed: 10 },
  { weightCare: 20, weightDepth: 50, weightBag: 30 },
)
ok(depthHeavy === 80, 'веса 20/50/30 при care0 depth100 bag100 → 80')

// ─── finish ─────────────────────────────────────────────────────────
console.log('')
if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log(`All coach-quality checks passed (${COACH_QUALITY_STATUS_LABELS.ok}/${COACH_QUALITY_STATUS_LABELS.attention}/${COACH_QUALITY_STATUS_LABELS.review})`)
