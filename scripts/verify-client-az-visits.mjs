/**
 * Факт визитов АЗ: уникальные даты в progress + session_visits во вкладке «Тренировки».
 * node scripts/verify-client-az-visits.mjs
 */
import { buildClientMemberships, buildClientProgress } from '../api/_lib/clientPortal/clientMeCore.js'
import { buildDeskMembershipVisits, buildMembershipVisits } from '../api/_lib/clientPortal/clientMembershipVisitsCore.js'
import { collectClientVisitDates } from '../src/lib/client/clientVisitDatesCore.js'
import { membershipTrainingsCards } from '../src/lib/client/clientMembershipVisitsUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const TODAY = '2026-10-30'
const azMem = {
  id: 'm-az',
  hall: 'az',
  membership_type_id: 't-az',
  start_date: '2026-09-01',
  end_date: '2026-12-01',
  total_trainings: 12,
  used_trainings: 3,
  session_visits: [
    { id: 'v1', date: '2026-10-10', created_at: '2026-10-10T12:00:00.000Z' },
    { id: 'v2', date: '2026-10-20', created_at: '2026-10-20T12:00:00.000Z' },
    { id: 'v3', date: '2026-10-27', created_at: '2026-10-27T12:00:00.000Z' },
  ],
}
const pzMem = {
  id: 'm-pz',
  hall: 'pz',
  membership_type_id: 't-pz',
  start_date: '2026-09-01',
  end_date: '2026-12-01',
  total_trainings: 17,
  used_trainings: 0,
}
const trainings = [
  {
    id: 't1',
    date: '2026-10-20',
    status: 'completed',
    trainer_id: 'tr1',
    data: { membership_id: 'm-pz', training_focus: 'Ноги', pre_weight_kg: 60 },
  },
  {
    id: 't2',
    date: '2026-10-25',
    status: 'completed',
    trainer_id: 'tr1',
    data: { membership_id: 'm-pz', training_focus: 'Спина' },
  },
  {
    id: 't3',
    date: '2026-10-12',
    status: 'completed',
    type: 'Списание',
    trainer_id: 'tr1',
    data: { membership_id: 'm-pz', is_writeoff: true },
  },
]

ok(
  collectClientVisitDates(trainings, [azMem, pzMem], TODAY).join() === '2026-10-10,2026-10-20,2026-10-25,2026-10-27',
  'уникальные даты: персоналки без неявки + АЗ; один день ПЗ+АЗ = один',
)
ok(collectClientVisitDates(trainings, [pzMem], TODAY).join() === '2026-10-20,2026-10-25', 'solo ПЗ — без АЗ дат')

const progress = buildClientProgress(trainings, [], [], TODAY, [azMem, pzMem])
ok(progress.visits_total === 4 && progress.visits_30d === 4, 'progress считает уникальные дни с АЗ')
ok(progress.last_visit === '2026-10-27' && progress.first_visit === '2026-10-10', 'первая/последняя с учётом АЗ')

const desk = buildDeskMembershipVisits(azMem, 'Бокс')
ok(desk.length === 3 && desk.every((v) => v.kind === 'desk' && v.focus === 'Бокс'), 'desk view из session_visits')
ok(!JSON.stringify(desk).includes('created_at'), 'служебное created_at не уходит')

const azVisits = buildMembershipVisits(azMem, [], null, { hall: 'az', directionLabel: 'Бокс' })
ok(azVisits.map((v) => v.date).join() === '2026-10-10,2026-10-20,2026-10-27', 'АЗ visits по датам')
ok(azVisits.every((v) => v.kind === 'desk'), 'АЗ — только desk')

const types = [
  { id: 't-az', code: 'АЗ-B', name: 'Бокс' },
  { id: 't-pz', code: 'ПЗ 17' },
]
const polluted = [
  ...trainings,
  {
    id: 't-orphan',
    date: '2026-10-15',
    status: 'completed',
    trainer_id: 'tr1',
    data: { training_focus: 'Сирота без membership_id' },
  },
  {
    id: 't-az-diary',
    date: '2026-10-18',
    status: 'completed',
    trainer_id: 'tr1',
    data: { membership_id: 'm-az', training_focus: 'Не должно в АЗ' },
  },
]
const ms = buildClientMemberships([azMem, pzMem], types, polluted, TODAY, new Map([['tr1', 'Анна']]))
const azView = ms.current.find((m) => m.hall === 'az')
ok(azView?.used === 3 && azView.visits.length === 3, 'счётчик АЗ = session_visits')
ok(azView.visits.every((v) => v.kind === 'desk' && v.focus === 'Бокс'), 'направление на строках АЗ')
ok(
  !azView.visits.some((v) => v.id === 't-az-diary' || v.id === 't-orphan'),
  'дневник не подмешивается в visits АЗ',
)
ok(!('session_visits' in azView), 'сырой session_visits не в ответе')

const cards = membershipTrainingsCards(ms)
const azCard = cards.find((c) => c.title.includes('Бокс') || c.title.includes('АЗ'))
ok(azCard && azCard.rows.length === 3 && azCard.rows.every((r) => !r.canOpen), 'карточка АЗ: строки без окна')
ok(azCard.rows.some((r) => /у стойки/.test(r.meta)), 'подпись «у стойки»')
ok(/у стойки/.test(azCard.summary), 'итог карточки — у стойки')

const tzMs = {
  current: [
    {
      hall: 'tz',
      hall_mark: 'ТЗ',
      label: 'ТЗ',
      status: 'active',
      total: null,
      used: 0,
      start_date: '2026-01-01',
      end_date: '2027-01-01',
      visits: [],
    },
  ],
}
const [tzCard] = membershipTrainingsCards(tzMs)
ok(tzCard.rows.length === 0 && /без списания/.test(tzCard.summary) && tzCard.emptyHint, 'ТЗ — только срок')

if (failed) {
  console.error(`\nverify-client-az-visits: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-az-visits: OK')
