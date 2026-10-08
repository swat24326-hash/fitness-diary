/**
 * /me: тренировки по абонементу (/me/trainings) и «N недель подряд с тренировками».
 * node scripts/verify-client-membership-visits.mjs
 */
import { buildClientMemberships, buildClientProgress } from '../api/_lib/clientPortal/clientMeCore.js'
import { buildMembershipVisits, membershipVisitTrainerIds } from '../api/_lib/clientPortal/clientMembershipVisitsCore.js'
import { weeksStreak } from '../api/_lib/clientPortal/clientWeeksStreakCore.js'
import { membershipTrainingsCards, trainingsMemberships } from '../src/lib/client/clientMembershipVisitsUiCore.js'
import { weeksStreakLabel } from '../src/lib/client/clientMeUiCore.js'

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
const names = new Map([['tr1', 'Анна'], ['tr2', 'Олег']])
const m1 = { id: 'm1', membership_type_id: 't1', start_date: '2026-09-15', end_date: '2026-11-15', total_trainings: 12, used_trainings: 0 }
const trainings = [
  { id: 'c', date: '2026-09-27', status: 'completed', type: 'Силовая', trainer_id: 'tr1', data: {} },
  { id: 'a', date: '2026-09-20', status: 'completed', trainer_id: 'tr1', data: { membership_id: 'm1', training_focus: 'Ноги', pre_weight_kg: '64,5', notes: 'секрет тренера' } },
  { id: 'b', date: '2026-09-25', status: 'completed', type: 'Списание', trainer_id: 'tr2', data: { membership_id: 'm1', is_writeoff: true, pre_weight_kg: 70 } },
  { id: 'x', date: '2026-09-26', status: 'completed', trainer_id: 'tr2', data: { membership_id: 'm2' } },
  { id: 'd', date: '2026-10-01', status: 'draft', trainer_id: 'tr1', data: { membership_id: 'm1' } },
  { id: 'e', date: '2026-10-02', status: 'completed', trainer_id: 'tr9', data: { membership_id: 'm1' } },
]

// --- Сервер: тренировки по абонементу ---
const visits = buildMembershipVisits(m1, trainings, names)
ok(visits.map((v) => v.id).join() === 'a,b,c,e', 'те же тренировки, что счётчик: по id + старые без id в датах; без чужого абона и черновиков')
ok(visits[0].focus === 'Ноги' && visits[0].kg === 64.5 && visits[0].trainer_name === 'Анна', 'направленность, вес, тренер')
ok(visits[1].no_show === true && visits[1].kg === null && visits[1].focus === null, 'неявка помечена, без веса')
ok(visits[2].focus === 'Силовая' && visits[3].trainer_name === null, 'без направленности — тип; тренер не найден — без имени')
ok(
  visits.every((v) => Object.keys(v).sort().join() === 'date,focus,id,kg,no_show,trainer_name'),
  'наружу id, дата, направленность, вес, тренер, неявка — без заметок и data',
)
ok(!JSON.stringify(visits).includes('секрет'), 'заметки тренера не попадают в список')
ok(membershipVisitTrainerIds([m1], trainings).sort().join() === 'tr1,tr2,tr9', 'имена тренеров — только для тренировок абонемента')

const types = [{ id: 't1', code: 'ПЗ 12' }]
const ms = buildClientMemberships([m1, { ...m1, id: 'm3', start_date: '2026-11-16', end_date: '2027-01-16' }], types, trainings, TODAY, names)
const cur = ms.current[0]
ok(cur.used === visits.length && cur.visits.length === cur.used, 'список = цифра «списано»')
ok(ms.current[1].status === 'upcoming' && ms.current[1].visits.length === 0, 'у ждущего старта тренировок нет')

// --- Экран /me/trainings ---
ok(trainingsMemberships(ms).length === 1, 'ждущий старта абонемент не показываем')
const [card] = membershipTrainingsCards(ms)
ok(card.title === 'ПЗ 12' && card.period === '15.09.2026 – 15.11.2026', 'название и срок абонемента')
ok(card.summary === 'Списано 4 из 12 · 1 неявка · тренер Анна', 'итог: списано, неявки, основной тренер')
ok(card.rows[0].n === 4 && card.rows[0].training.id === 'e', 'новые сверху, № — порядок списания')
ok(card.rows[3].meta === '№1 · 64,5\u00a0кг' && card.rows[3].month === 'сен' && card.rows[3].canOpen, 'строка: №, вес, месяц в квадрате; открывается')
ok(card.rows[2].noShow && !card.rows[2].canOpen && card.rows[2].meta.startsWith('№2 · '), 'неявка: «списано», окно не открываем')
ok(card.gap === null, 'всё списанное есть в списке — без оговорки')

const stored = buildClientMemberships([{ ...m1, used_trainings: 7 }], types, trainings, TODAY, names)
ok(membershipTrainingsCards(stored)[0].gap?.startsWith('Ещё 3 занятия списаны в клубе'), 'поле больше дневника — честная оговорка, не выдуманные даты')
const unlimited = buildClientMemberships([{ ...m1, total_trainings: 0 }], types, trainings, TODAY, names)
ok(membershipTrainingsCards(unlimited)[0].summary === '4 занятия · 1 неявка · тренер Анна', 'безлимит — без «из N»')

const ended = buildClientMemberships([{ ...m1, end_date: '2026-10-01' }], types, trainings, TODAY, names)
ok(ended.current.length === 0 && ended.last_ended?.end_date === '2026-10-01', 'закончился — в last_ended, плитка видит дату')
const [endedCard] = membershipTrainingsCards(ended)
ok(endedCard?.period.endsWith(', закончился') && endedCard.rows.length === 4, 'нет действующего — тренировки последнего закончившегося')
ok(membershipTrainingsCards({ current: [], last_ended: { label: 'ПЗ', end_date: '2026-01-01' } }).length === 0, 'старый кэш без visits — пусто')
ok(membershipTrainingsCards(null).length === 0, 'нет данных — пусто')

// --- Недели подряд (сегодня — среда 07.10.2026) ---
ok(weeksStreak(['2026-10-05', '2026-09-30', '2026-09-22'], TODAY) === 3, 'три недели подряд, включая текущую')
ok(weeksStreak(['2026-09-30', '2026-09-22'], TODAY) === 2, 'текущая неделя без визита серию не рвёт')
ok(weeksStreak(['2026-09-30', '2026-09-15'], TODAY) === 1, 'пропущенная неделя рвёт серию')
ok(weeksStreak(['2026-09-22'], TODAY) === 0, 'прошлая неделя пустая — серии нет')
ok(weeksStreak(['2026-10-04', '2026-09-28'], TODAY) === 1, 'воскресенье и понедельник одной недели — одна неделя')
ok(weeksStreak(['2026-10-04', '2026-10-05'], TODAY) === 2, 'воскресенье и следующий понедельник — две недели')
ok(weeksStreak(['2025-12-29', '2026-01-05'], '2026-01-07') === 2, 'через Новый год')
ok(weeksStreak([], TODAY) === 0, 'нет визитов')

const progress = buildClientProgress(
  [
    { id: 'p1', date: '2026-10-05', status: 'completed', data: {} },
    { id: 'p2', date: '2026-09-29', status: 'completed', type: 'Списание', data: { is_writeoff: true } },
    { id: 'p3', date: '2026-09-22', status: 'completed', data: {} },
  ],
  [],
  [],
  TODAY,
)
ok(progress.weeks_streak === 1, 'неявка неделю не засчитывает')

ok(weeksStreakLabel(1) === null && weeksStreakLabel(0) === null && weeksStreakLabel(undefined) === null, 'одна неделя — ещё не серия')
ok(weeksStreakLabel(2) === '2 недели подряд с тренировками', '2 недели')
ok(weeksStreakLabel(5) === '5 недель подряд с тренировками' && weeksStreakLabel(21) === '21 неделя подряд с тренировками', 'склонение')

if (failed) {
  console.error(`\nverify-client-membership-visits: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-membership-visits: OK')
