/**
 * /me: первая карточка (тренировка скоро или абонемент), напоминание о продлении, график веса.
 * node scripts/verify-client-me-highlights.mjs
 */
import {
  clientMeLeadCard,
  clientRenewalHint,
  weightSparkPoints,
} from '../src/lib/client/clientMeHighlightsCore.js'

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
const mem = (o) => ({ status: 'active', total: 10, used: 3, remaining: 7, days_left: 20, ...o })

ok(clientMeLeadCard({ as_of: TODAY, next_session: { date: TODAY } }) === 'session', 'тренировка сегодня — первая')
ok(clientMeLeadCard({ as_of: TODAY, next_session: { date: '2026-10-08' } }) === 'session', 'тренировка завтра — первая')
ok(clientMeLeadCard({ as_of: TODAY, next_session: { date: '2026-10-09' } }) === 'membership', 'послезавтра — первым абонемент')
ok(clientMeLeadCard({ as_of: TODAY, next_session: null }) === 'membership', 'нет тренировки — абонемент')

ok(clientRenewalHint({ current: [mem()] }) === null, 'запас большой — молчим')
ok(/Осталось 2 тренировки/.test(clientRenewalHint({ current: [mem({ remaining: 2 })] }) ?? ''), 'осталось 2 — напоминание')
ok(/Осталось 1 тренировка/.test(clientRenewalHint({ current: [mem({ remaining: 1 })] }) ?? ''), 'склонение «1 тренировка»')
ok(/через 5 дней/.test(clientRenewalHint({ current: [mem({ days_left: 5 })] }) ?? ''), 'срок ≤7 дней — напоминание')
ok(/последний день/.test(clientRenewalHint({ current: [mem({ days_left: 0 })] }) ?? ''), 'последний день')
ok(
  /через 3 дня/.test(clientRenewalHint({ current: [mem({ total: null, remaining: null, days_left: 3 })] }) ?? ''),
  'безлимит — только по сроку',
)
ok(clientRenewalHint({ current: [mem({ remaining: 1 }), mem({ status: 'upcoming' })] }) === null, 'следующий уже куплен — молчим')
ok(clientRenewalHint({ current: [mem({ status: 'depleted', remaining: 0 })] }) === null, 'исчерпан — без дубля подписи')
ok(clientRenewalHint({ current: [], last_ended: { label: 'ПЗ' } }) === null, 'нет текущих — молчим')

ok(weightSparkPoints([{ date: '2026-09-01', kg: 80 }], 300, 64) === null, 'одна точка — графика нет')
const pts = weightSparkPoints(
  [
    { date: '2026-09-01', kg: 82 },
    { date: '2026-09-03', kg: 81 },
    { date: '2026-10-01', kg: 80 },
  ],
  300,
  64,
)
const parsed = (pts ?? '').split(' ').map((p) => p.split(',').map(Number))
ok(parsed.length === 3, 'три точки')
ok(parsed[0][0] === 4 && parsed[2][0] === 296, 'края по X с отступом')
ok(parsed[1][0] < 40, 'X по датам, не по индексу')
ok(parsed[0][1] === 4 && parsed[2][1] === 60, 'больший вес выше')
const flat = weightSparkPoints(
  [
    { date: '2026-09-01', kg: 80 },
    { date: '2026-09-10', kg: 80 },
  ],
  300,
  64,
)
ok(flat === '4,32 296,32', 'ровный вес — линия посередине')

if (failed) {
  console.error(`\nverify-client-me-highlights: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-me-highlights: OK')
