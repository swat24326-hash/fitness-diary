/**
 * Главная /me: выбор абона по залам, метки, бонусы, подпись о смеси.
 * node scripts/verify-client-home-hall.mjs
 */
import {
  clientHomeOtherHallsNote,
  clientShowsLoyaltyBlock,
  liveHallsFromMembershipViews,
  membershipHallMarkRu,
  pickHomeMembership,
  withMembershipHallCaption,
} from '../src/lib/client/clientHomeHallCore.js'
import { buildClientMemberships } from '../api/_lib/clientPortal/clientMeCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

ok(membershipHallMarkRu('pz') === 'ПЗ', 'метка ПЗ')
ok(membershipHallMarkRu('tz') === 'ТЗ', 'метка ТЗ')
ok(membershipHallMarkRu('az', 'Бокс') === 'АЗ · Бокс', 'метка АЗ с направлением')
ok(membershipHallMarkRu('az', 'АЗ · Степ') === 'АЗ · Степ', 'не дублируем АЗ в типе')
ok(withMembershipHallCaption('4 тренировки списано', { hall_mark: 'ПЗ' }) === 'ПЗ · 4 тренировки списано', 'префикс подписи')

const pz = { hall: 'pz', status: 'active', days_left: 40, remaining: 10, total: 12 }
const azUrgent = { hall: 'az', status: 'active', days_left: 5, remaining: 7, total: 12, label: 'Бокс' }
const azCalm = { hall: 'az', status: 'active', days_left: 40, remaining: 10, total: 12 }
const tz = { hall: 'tz', status: 'active', days_left: 5, remaining: null, total: null }

ok(pickHomeMembership([pz, azUrgent])?.hall === 'az', 'смесь: меньше дней — АЗ')
ok(pickHomeMembership([pz, azCalm])?.hall === 'pz', 'равные дни — ПЗ раньше АЗ')
ok(pickHomeMembership([{ ...pz, remaining: 3 }, { ...azCalm, days_left: 40, remaining: 10 }])?.remaining === 3, 'меньше остатка занятий')
ok(pickHomeMembership([tz, { ...pz, days_left: 5 }])?.hall === 'pz', 'равные дни ПЗ vs ТЗ — ПЗ')
ok(
  pickHomeMembership([
    { hall: 'pz', status: 'depleted', days_left: 1, remaining: 0, total: 10 },
    { hall: 'az', status: 'active', days_left: 30, remaining: 5, total: 12 },
  ])?.hall === 'az',
  'active важнее depleted',
)

const halls = liveHallsFromMembershipViews([pz, azUrgent, { hall: 'az', status: 'upcoming' }])
ok(halls.has('pz') && halls.has('az') && halls.size === 2, 'живые залы без upcoming')
ok(clientHomeOtherHallsNote({ current: [pz, azUrgent] })?.includes('Тренировки'), 'подпись о смеси')
ok(clientHomeOtherHallsNote({ current: [pz] }) === null, 'solo — без подписи')

ok(clientShowsLoyaltyBlock({ loyalty: { points: 10 }, memberships: { current: [pz] } }), 'ПЗ — бонусы')
ok(clientShowsLoyaltyBlock({ loyalty: { points: 10 }, memberships: { current: [pz, azUrgent] } }), 'смесь с ПЗ — бонусы')
ok(!clientShowsLoyaltyBlock({ loyalty: { points: 0 }, memberships: { current: [azUrgent] } }), 'solo АЗ без баллов — нет')
ok(clientShowsLoyaltyBlock({ loyalty: { points: 5 }, memberships: { current: [azUrgent] } }), 'хвост баллов без ПЗ — показать')
ok(!clientShowsLoyaltyBlock({ loyalty: null, memberships: { current: [pz] } }), 'нет снимка — нет блока')

const types = [
  { id: 't-pz', code: 'ПЗ 12' },
  { id: 't-az', code: 'АЗ-B', name: 'Бокс' },
]
const TODAY = '2026-10-30'
const built = buildClientMemberships(
  [
    {
      id: 'm1',
      hall: 'az',
      membership_type_id: 't-az',
      start_date: '2026-09-01',
      end_date: '2026-12-01',
      total_trainings: 12,
      used_trainings: 2,
    },
    {
      id: 'm2',
      hall: 'pz',
      membership_type_id: 't-pz',
      start_date: '2026-09-01',
      end_date: '2026-12-01',
      total_trainings: 12,
      used_trainings: 1,
    },
  ],
  types,
  [],
  TODAY,
)
ok(built.current.some((m) => m.hall === 'az' && m.hall_mark === 'АЗ · Бокс'), 'view: hall + hall_mark АЗ')
ok(built.current.some((m) => m.hall === 'pz' && m.hall_mark === 'ПЗ'), 'view: hall_mark ПЗ')
ok(!('membership_type_id' in built.current[0]), 'id типа не уходит')

if (failed) {
  console.error(`\nverify-client-home-hall: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-home-hall: OK')
