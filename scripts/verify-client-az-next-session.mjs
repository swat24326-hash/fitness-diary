/**
 * «Следующая» у клиента АЗ: персоналка vs группа по инструктору+направлению.
 * node scripts/verify-client-az-next-session.mjs
 */
import {
  clientAzGroupMatchKeys,
  clientNextSessionFootRu,
  coerceScheduleDirectionTypeId,
  isScheduleEntryUpcoming,
  pickClientNextSession,
} from '../src/lib/client/clientAzNextSessionCore.js'
import { sessionTile } from '../src/lib/client/clientMeTilesCore.js'
import { normalizeTrainerSchedulePushPayload } from '../src/lib/trainer/trainerSchedulePushPayload.js'

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
const DIR = '11111111-1111-4111-8111-111111111111'
const DIR2 = '22222222-2222-4222-8222-222222222222'
const INST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

ok(coerceScheduleDirectionTypeId('group', DIR) === DIR, 'direction only for group')
ok(coerceScheduleDirectionTypeId('training', DIR) === null, 'no direction on personal')
ok(clientAzGroupMatchKeys([{ instructor_id: INST, direction_type_id: DIR }]).has(`${INST}:${DIR}`), 'match key')

ok(isScheduleEntryUpcoming({ day_date: TODAY, start_minutes: 18 * 60, duration_minutes: 60 }, TODAY, 12 * 60), 'later today ok')
ok(!isScheduleEntryUpcoming({ day_date: TODAY, start_minutes: 9 * 60, duration_minutes: 60 }, TODAY, 12 * 60), 'ended today skip')

const personal = [
  {
    id: 'p1',
    day_date: '2026-11-02',
    start_minutes: 13 * 60,
    duration_minutes: 60,
    trainer_id: 'tr-pz',
    kind: 'training',
    client_ids: ['c1'],
  },
]
const groups = [
  {
    id: 'g1',
    day_date: '2026-10-31',
    start_minutes: 19 * 60,
    duration_minutes: 60,
    trainer_id: INST,
    kind: 'group',
    direction_type_id: DIR,
    client_ids: [],
    title: 'Бокс',
  },
  {
    id: 'g-wrong-dir',
    day_date: '2026-10-30',
    start_minutes: 10 * 60,
    duration_minutes: 60,
    trainer_id: INST,
    kind: 'group',
    direction_type_id: DIR2,
    client_ids: [],
    title: 'Степ',
  },
  {
    id: 'g-wrong-inst',
    day_date: '2026-10-30',
    start_minutes: 8 * 60,
    duration_minutes: 60,
    trainer_id: OTHER,
    kind: 'group',
    direction_type_id: DIR,
    client_ids: [],
    title: 'Чужой',
  },
]

const azLinks = [{ instructor_id: INST, direction_type_id: DIR }]
const names = new Map([
  [INST, 'Олег'],
  ['tr-pz', 'Марина'],
])
const dirs = new Map([[DIR, 'Бокс']])

const nextGroup = pickClientNextSession({
  personalEntries: personal,
  groupEntries: groups,
  azLinks,
  today: TODAY,
  nowMinutes: 12 * 60,
  trainerNameById: names,
  directionNameById: dirs,
})
ok(nextGroup?.kind === 'group' && nextGroup.date === '2026-10-31', 'ближе группа АЗ, не чужие направления')
ok(nextGroup?.direction_name === 'Бокс' && nextGroup.trainer_name === 'Олег', 'имя направления и инструктора')
ok(clientNextSessionFootRu(nextGroup) === 'Бокс · группа', 'подпись группы')

const nextPersonal = pickClientNextSession({
  personalEntries: personal,
  groupEntries: [],
  azLinks: [],
  today: TODAY,
  nowMinutes: 0,
  trainerNameById: names,
})
ok(nextPersonal?.kind === 'personal' && clientNextSessionFootRu(nextPersonal) === 'персоналка · Марина', 'персоналка')

const tile = sessionTile(nextGroup, TODAY)
ok(tile.foot === 'Бокс · группа' && tile.hero === '19:00', 'плитка показывает группу')

const onlyWrong = pickClientNextSession({
  personalEntries: [],
  groupEntries: groups.filter((g) => g.id !== 'g1'),
  azLinks,
  today: TODAY,
  nowMinutes: 0,
  trainerNameById: names,
  directionNameById: dirs,
})
ok(onlyWrong === null, 'чужой инструктор / другое направление — не показываем')

const groupInPersonalBag = {
  id: 'g-leak',
  day_date: '2026-10-30',
  start_minutes: 8 * 60,
  duration_minutes: 60,
  trainer_id: INST,
  kind: 'group',
  direction_type_id: DIR,
  client_ids: ['c1'],
}
const notPersonalLeak = pickClientNextSession({
  personalEntries: [groupInPersonalBag],
  groupEntries: [],
  azLinks,
  today: TODAY,
  nowMinutes: 0,
  trainerNameById: names,
  directionNameById: dirs,
})
ok(notPersonalLeak === null, 'группа в personalEntries не становится персоналкой')

const CLUB = '33333333-3333-4333-8333-333333333333'
const pushed = normalizeTrainerSchedulePushPayload({
  id: '44444444-4444-4444-8444-444444444444',
  club_id: CLUB,
  trainer_id: INST,
  day_date: TODAY,
  start_minutes: 60,
  duration_minutes: 60,
  title: 'Бокс',
  client_ids: [],
  kind: 'group',
  direction_type_id: DIR,
})
ok(pushed?.direction_type_id === DIR && pushed.kind === 'group', 'push payload keeps direction on group')

const noKind = normalizeTrainerSchedulePushPayload({
  id: '55555555-5555-4555-8555-555555555555',
  club_id: CLUB,
  trainer_id: INST,
  day_date: TODAY,
  start_minutes: 60,
  duration_minutes: 60,
  title: 'заметка',
  client_ids: [],
})
ok(!Object.prototype.hasOwnProperty.call(noKind ?? {}, 'kind'), 'старый бандл без kind — поле не шлём')

if (failed) {
  console.error(`\nverify-client-az-next-session: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-az-next-session: OK')
