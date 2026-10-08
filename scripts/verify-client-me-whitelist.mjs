/**
 * /api/client-me: белые списки полей, абонемент, ближайшая тренировка, прогресс, бонусы.
 * Плюс SQL фильтра .contains() для поиска слотов по client_ids.
 * node scripts/verify-client-me-whitelist.mjs
 */
import { compilePgRestQuery } from '../api/_lib/pgRest/buildSql.js'
import { createPgRestClient } from '../api/_lib/pgRest/query.js'
import {
  buildClientLoyalty,
  buildClientMemberships,
  buildClientProgress,
  pickNextClientSession,
} from '../api/_lib/clientPortal/clientMeCore.js'
import { buildClientRecentTrainings, recentTrainerIds } from '../api/_lib/clientPortal/clientRecentTrainingsCore.js'
import {
  formatSessionDayRu,
  formatSignedRu,
  measurementDeltas,
  membershipStatusLineRu,
  pointsWord,
  trainingsWord,
} from '../src/lib/client/clientMeUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const TODAY = '2026-10-07'
const FORBIDDEN = ['data', 'paid_amount', 'phone', 'note', 'notes', 'title', 'trainer_id', 'client_id', 'club_id', 'session_visits', 'membership_type_id', 'comment']

function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k)
      keysDeep(v, out)
    }
  }
  return out
}

// --- Абонементы ---
const types = [{ id: 't1', code: 'ПЗ 12' }]
const mPz = {
  id: 'm1', membership_type_id: 't1', start_date: '2026-09-15', end_date: '2026-11-15',
  total_trainings: 12, used_trainings: 3, paid_amount: 24000, session_visits: [], club_id: 'c', client_id: 'x',
}
const trainings = [
  { id: 'a', date: '2026-09-20', status: 'completed', type: 'Силовая', data: { membership_id: 'm1', notes: 'секрет тренера' } },
  { id: 'b', date: '2026-09-25', status: 'completed', type: 'Силовая', data: { membership_id: 'm1' } },
  { id: 'c', date: '2026-09-27', status: 'completed', type: 'Силовая', data: { membership_id: 'm1' } },
  { id: 'd', date: '2026-10-01', status: 'completed', type: 'Силовая', data: { membership_id: 'm1' } },
  { id: 'e', date: '2026-10-03', status: 'completed', type: 'Списание', data: { membership_id: 'm1', is_writeoff: true } },
]
const ms = buildClientMemberships([mPz], types, trainings, TODAY)
ok(ms.current.length === 1 && ms.last_ended === null, 'один текущий абонемент')
const cur = ms.current[0]
ok(cur.label === 'ПЗ 12' && cur.total === 12, 'название из типа, лимит')
ok(cur.used === 5 && cur.remaining === 7, 'счётчик по дневнику (max с полем), неявка списывает')
ok(cur.days_left === 39 && cur.status === 'active', 'дней до конца, статус')
ok(!('paid_amount' in cur) && !('session_visits' in cur), 'оплата и визиты не уходят')

const depleted = buildClientMemberships([{ ...mPz, used_trainings: 12 }], types, [], TODAY).current[0]
ok(depleted.status === 'depleted' && depleted.remaining === 0, 'лимит исчерпан')
const upcoming = buildClientMemberships([{ ...mPz, start_date: '2026-10-20', end_date: '2026-12-20', used_trainings: 0 }], types, [], TODAY).current[0]
ok(upcoming.status === 'upcoming', 'абонемент ждёт старта')
const unlimited = buildClientMemberships([{ ...mPz, total_trainings: 0, membership_type_id: null }], types, [], TODAY).current[0]
ok(unlimited.total === null && unlimited.remaining === null && unlimited.label === 'Абонемент', 'без лимита занятий')
const ended = buildClientMemberships([{ ...mPz, end_date: '2026-09-30' }, { ...mPz, id: 'm0', end_date: '2026-05-01' }], types, [], TODAY)
ok(ended.current.length === 0 && ended.last_ended?.end_date === '2026-09-30', 'нет текущих — последний закончившийся')
ok(buildClientMemberships([], types, [], TODAY).last_ended === null, 'абонементов нет')
const endsToday = buildClientMemberships([{ ...mPz, end_date: TODAY }], types, [], TODAY).current[0]
ok(endsToday?.days_left === 0 && endsToday.status === 'active', 'последний день — ещё действует')

// --- Ближайшая тренировка ---
const names = new Map([['tr1', 'Пётр']])
const entries = [
  { day_date: '2026-10-07', start_minutes: 9 * 60, duration_minutes: 60, trainer_id: 'tr1', title: 'заметка тренера' },
  { day_date: '2026-10-07', start_minutes: 18 * 60, duration_minutes: 60, trainer_id: 'tr1' },
  { day_date: '2026-10-09', start_minutes: 8 * 60, duration_minutes: 60, trainer_id: 'tr2' },
]
const next = pickNextClientSession(entries, TODAY, 12 * 60, names)
ok(next?.date === TODAY && next.time === '18:00–19:00' && next.trainer_name === 'Пётр', 'сегодняшняя прошедшая пропущена')
ok(!('title' in next) && !('trainer_id' in next), 'заметка и id тренера не уходят')
ok(pickNextClientSession(entries, TODAY, 9 * 60 + 30, names)?.time === '09:00–10:00', 'идущая сейчас ещё показывается')
ok(pickNextClientSession(entries, TODAY, 23 * 60, names)?.trainer_name === null, 'неизвестный тренер — без имени')
ok(pickNextClientSession([], TODAY, 0, names) === null, 'нет слотов')
ok(pickNextClientSession([{ day_date: '2026-10-01', start_minutes: 0 }], TODAY, 0, names) === null, 'прошлые дни не берём')

// --- Прогресс ---
const progress = buildClientProgress(
  [...trainings, { id: 'f', date: '2026-10-10', status: 'completed', type: 'Силовая', data: {} }],
  [{ date: '2026-10-01', weight_kg: '71.5', note: 'x' }, { date: '2026-09-01', weight_kg: 74 }, { date: 'bad', weight_kg: 70 }],
  [{ date: '2026-09-01', neck: 35, waist: 80, comment: 'x', client_id: 'x' }, { date: '2026-10-01' }],
  TODAY,
)
ok(progress.visits_total === 4, 'визиты без неявки и без будущих дат')
ok(progress.first_visit === '2026-09-20' && progress.last_visit === '2026-10-01', 'первый и последний визит')
ok(progress.visits_30d === 4, 'визиты за 30 дней')
ok(buildClientProgress(trainings, [], [], '2026-10-25').visits_30d === 2, 'старше 30 дней не считаются')
ok(progress.weights.length === 2 && progress.weights[0].kg === 74 && progress.weights[1].kg === 71.5, 'вес по возрастанию даты, число')
ok(progress.measurements.length === 1, 'пустой замер отброшен')
const withTrainingWeights = buildClientProgress(
  [
    { id: 'w1', date: '2026-09-01', status: 'completed', data: { pre_weight_kg: '73,5' } },
    { id: 'w2', date: '2026-09-25', status: 'completed', data: JSON.stringify({ pre_weight_kg: 72 }) },
    { id: 'w3', date: '2026-10-20', status: 'completed', data: { pre_weight_kg: 70 } },
  ],
  [{ date: '2026-09-01', weight_kg: 74 }, { date: '2026-09-10', weight_kg: 73 }],
  [],
  TODAY,
)
ok(
  withTrainingWeights.weights.map((w) => `${w.date}:${w.kg}`).join() === '2026-09-01:73.5,2026-09-10:73,2026-09-25:72',
  'вес из тренировок без открытия истории в карточке; день — одно значение, тренировка главнее; будущее не берём',
)
const mv = progress.measurements[0].values
ok(mv.neck === 35 && mv.waist_upper === 80 && mv.waist_lower === 80, 'замеры по полям приложения (с legacy fallback)')

// --- Тренировки за 30 дней (/me/trainings) ---
const recentSrc = [
  { id: 'r1', date: '2026-09-07', status: 'completed', type: 'Силовая', trainer_id: 'tr1', data: { training_focus: 'Старое' } },
  { id: 'r2', date: '2026-09-08', status: 'completed', type: 'Силовая', trainer_id: 'tr1', data: { training_focus: '  Ноги   ягодицы ', pre_weight_kg: '74,5', notes: 'секрет', exercises: [{ name: 'x' }] } },
  { id: 'r3', date: '2026-10-03', status: 'completed', type: 'Списание', trainer_id: 'tr2', data: { is_writeoff: true, pre_weight_kg: 70 } },
  { id: 'r4', date: '2026-10-05', status: 'completed', type: 'Кардио', trainer_id: 'tr9', data: JSON.stringify({ pre_weight_kg: 73 }) },
  { id: 'r5', date: '2026-10-06', status: 'draft', type: 'Силовая', trainer_id: 'tr1', data: {} },
  { id: 'r6', date: '2026-10-09', status: 'completed', type: 'Силовая', trainer_id: 'tr1', data: {} },
]
const recentNames = new Map([['tr1', 'Анна'], ['tr2', 'Олег']])
const recent = buildClientRecentTrainings(recentSrc, TODAY, recentNames)
ok(recent.map((r) => r.date).join() === '2026-10-05,2026-10-03,2026-09-08', '30 дней как в «за 30 дней»: новые сверху, без черновиков и будущего')
ok(recent[2].focus === 'Ноги ягодицы' && recent[2].kg === 74.5 && recent[2].trainer_name === 'Анна', 'направленность, вес, имя тренера')
ok(recent[1].no_show === true && recent[1].focus === null && recent[1].kg === null, 'неявка — с пометкой, без веса')
ok(recent[0].focus === 'Кардио' && recent[0].trainer_name === null, 'без направленности — тип; тренер не найден — без имени')
ok(
  [...keysDeep(recent)].sort().join() === 'date,focus,kg,no_show,trainer_name',
  'наружу только дата, направленность, вес, тренер, неявка — без заметок, упражнений и id',
)
ok(recentTrainerIds(recentSrc, TODAY).sort().join() === 'tr1,tr2,tr9', 'имена тренеров — только для тренировок окна')
const progressForCount = buildClientProgress(recentSrc, [], [], TODAY)
ok(recent.filter((r) => !r.no_show).length === progressForCount.visits_30d, 'список без неявок = цифра «за 30 дней»')

// --- Бонусы ---
ok(buildClientLoyalty(null) === null, 'нет снимка')
ok(buildClientLoyalty({ enabled: false, points: 0 }) === null, 'программа выключена и баллов нет — блока нет')
const loy = buildClientLoyalty({ enabled: true, points: 150, unlock_on: '2026-12-01', can_redeem: false, kcal_remainder: 10, missed_open_week: true })
ok(loy?.points === 150 && Object.keys(loy).sort().join() === 'can_redeem,enabled,points,unlock_on', 'только итог снимка')
ok(buildClientLoyalty({ enabled: false, points: 50 })?.enabled === false, 'выключена, но баллы остались — показываем')

// --- Белый список целиком ---
const all = keysDeep({ memberships: ms, next_session: next, progress, loyalty: loy })
const leaked = FORBIDDEN.filter((k) => all.has(k))
ok(leaked.length === 0, `запрещённые поля не уходят${leaked.length ? `: ${leaked.join(', ')}` : ''}`)
ok(!JSON.stringify({ ms, progress }).includes('секрет тренера'), 'заметки тренера не попадают в ответ')

// --- Подписи экрана /me ---
ok(trainingsWord(1) === 'тренировка' && trainingsWord(3) === 'тренировки' && trainingsWord(11) === 'тренировок' && trainingsWord(21) === 'тренировка', 'склонение «тренировка»')
ok(pointsWord(1) === 'балл' && pointsWord(2) === 'балла' && pointsWord(5) === 'баллов' && pointsWord(0) === 'баллов', 'склонение «балл»')
ok(formatSessionDayRu(TODAY, TODAY) === 'Сегодня' && formatSessionDayRu('2026-10-08', TODAY) === 'Завтра', 'сегодня / завтра')
ok(formatSessionDayRu('2026-10-09', TODAY) === 'Пт, 09.10.2026', 'дальше — день недели и дата')
ok(membershipStatusLineRu({ ...cur, end_date: TODAY }, TODAY) === 'Последний день абонемента', 'последний день')
ok(membershipStatusLineRu(upcoming, TODAY).startsWith('Начнётся'), 'ждёт старта')
const deltas = measurementDeltas([{ values: { neck: 36, chest: 100 } }, { values: { neck: 35, glutes: 98 } }])
ok(deltas.length === 1 && deltas[0].id === 'neck' && deltas[0].diff === -1, 'дельта только по полям из обоих замеров')
ok(measurementDeltas([{ values: { neck: 1 } }]).length === 0, 'один замер — без дельты')
ok(formatSignedRu(-1.25, 'кг') === '−1,3 кг' && formatSignedRu(2, 'см') === '+2 см' && formatSignedRu(0, 'см') === '0 см', 'знак и запятая')

// --- SQL .contains() ---
const q = createPgRestClient()
  .from('trainer_schedule_entries')
  .select('day_date')
  .contains('client_ids', ['abc'])
  .gte('day_date', TODAY)
const sql = compilePgRestQuery(q.spec)
ok(sql.text.includes('"client_ids" @> $1::jsonb'), 'contains → @> ::jsonb')
ok(sql.values[0] === '["abc"]' && !sql.text.includes('abc'), 'значение contains только в параметре')

if (failed) {
  console.error(`\nverify-client-me-whitelist: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-me-whitelist: OK')
