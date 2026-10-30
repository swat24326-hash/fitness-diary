/**
 * Готовность пилота АЗ: инструкторы + группа + session_visits.
 * node scripts/verify-client-az-pilot-ready.mjs
 */
import {
  assessClientAzPilotReady,
  azInstructorsAssigned,
  azMembershipHasDeskVisits,
} from '../src/lib/client/clientAzPilotReadyCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const DIR = '11111111-1111-4111-8111-111111111111'
const INST = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-10-31'

const azMem = {
  id: 'm-az',
  hall: 'az',
  session_visits: [{ id: 'v1', date: '2026-10-20', created_at: '2026-10-20T12:00:00.000Z' }],
}
const azLinks = [{ instructor_id: INST, direction_type_id: DIR }]
const group = {
  id: 'g1',
  day_date: '2026-11-01',
  start_minutes: 19 * 60,
  duration_minutes: 60,
  trainer_id: INST,
  kind: 'group',
  direction_type_id: DIR,
  client_ids: [],
}

ok(azInstructorsAssigned(azLinks), 'инструктор+направление')
ok(!azInstructorsAssigned([]), 'без назначения — не готово')
ok(azMembershipHasDeskVisits(azMem), 'есть session_visits')
ok(!azMembershipHasDeskVisits({ hall: 'az', session_visits: [] }), 'пустые визиты — не готово')
ok(!azMembershipHasDeskVisits({ hall: 'pz', session_visits: azMem.session_visits }), 'ПЗ не считается АЗ')

const ready = assessClientAzPilotReady({
  azLinks,
  memberships: [azMem],
  groupEntries: [group],
  today: TODAY,
  nowMinutes: 0,
  trainerNameById: { [INST]: 'Олег' },
  directionNameById: { [DIR]: 'Бокс' },
})
ok(ready.ok && ready.missing.length === 0, 'полный пилот готов')

const noGroup = assessClientAzPilotReady({
  azLinks,
  memberships: [azMem],
  groupEntries: [],
  today: TODAY,
})
ok(!noGroup.ok && noGroup.missing.some((m) => /групп/.test(m)), 'без слота — missing группа')

const noVisits = assessClientAzPilotReady({
  azLinks,
  memberships: [{ ...azMem, session_visits: [] }],
  groupEntries: [group],
  today: TODAY,
})
ok(!noVisits.ok && noVisits.missing.some((m) => /session_visits/.test(m)), 'без визитов — missing visits')

const wrongDir = assessClientAzPilotReady({
  azLinks,
  memberships: [azMem],
  groupEntries: [{ ...group, direction_type_id: '99999999-9999-4999-8999-999999999999' }],
  today: TODAY,
})
ok(!wrongDir.ok, 'чужое направление не закрывает «Следующую»')

if (failed) {
  console.error(`\nverify-client-az-pilot-ready: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-az-pilot-ready: OK')
