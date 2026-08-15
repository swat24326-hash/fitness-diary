/**
 * node scripts/verify-sales-call-today.mjs
 */
import {
  buildCallTodayGlance,
  callTodayGlanceEyebrow,
  callTodayReasonLabel,
  callTodayReasonScore,
  detectCallNoteCallbackIntent,
  detectCallNoteDoneIntent,
  pickCallTodayEntryForClient,
  scoreCallLogForTodayQueue,
} from '../src/lib/admin/salesCallTodayCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(detectCallNoteCallbackIntent('перезвонить в пятницу') === true, 'callback note')
ok(detectCallNoteCallbackIntent('просто так') === false, 'plain note no callback')
ok(detectCallNoteDoneIntent('отказ, не звонить') === true, 'done note')
ok(detectCallNoteCallbackIntent('отказ, не звонить') === false, 'done not callback')
ok(callTodayReasonScore('note_callback') > callTodayReasonScore('missed'), 'score order')

const now = Date.parse('2026-08-15T12:00:00.000Z')
const logs = [
  {
    id: '1',
    client_id: 'a',
    client_name: 'Алина',
    status: 'ok',
    outcome: 'answered',
    staff_note: 'перезвонить завтра',
    created_at: '2026-08-14T10:00:00.000Z',
    phone: '79991234567',
  },
  {
    id: '2',
    client_id: 'b',
    client_name: 'Борис',
    status: 'ok',
    outcome: 'missed',
    staff_note: null,
    created_at: '2026-08-14T11:00:00.000Z',
    phone: '79997654321',
  },
  {
    id: '3',
    client_id: 'a',
    client_name: 'Алина',
    status: 'ok',
    outcome: 'missed',
    staff_note: null,
    created_at: '2026-08-13T09:00:00.000Z',
    phone: '79991234567',
  },
  {
    id: '4',
    client_id: 'c',
    client_name: 'Вера',
    status: 'fail',
    outcome: 'pending',
    staff_note: 'перезвонить',
    created_at: '2026-08-14T12:00:00.000Z',
  },
]

ok(scoreCallLogForTodayQueue(logs[0], { nowMs: now })?.kind === 'note_callback', 'score note')
ok(scoreCallLogForTodayQueue(logs[1], { nowMs: now })?.kind === 'missed', 'score missed')
ok(scoreCallLogForTodayQueue(logs[3], { nowMs: now }) == null, 'fail skipped')

const glance = buildCallTodayGlance(logs, {
  nowMs: now,
  clientsBasePath: '/sales/clients',
  clubId: 'club1',
  maxItems: 5,
})
ok(glance.total === 2, 'two clients (fail excluded)')
ok(glance.items[0].client_id === 'a' && glance.items[0].reason_kind === 'note_callback', 'note first')
ok(glance.items[1].client_id === 'b', 'missed second')
ok(glance.items[0].href.includes('/sales/clients/a'), 'href card')
ok(glance.items[0].href.includes('from=call-today'), 'href from')
ok(callTodayReasonLabel('missed').includes('Не взял'), 'label missed')
ok(callTodayReasonLabel('short').includes('Сброс'), 'label short')
ok(callTodayGlanceEyebrow({ total: 2 }).includes('2'), 'eyebrow count')
ok(callTodayGlanceEyebrow({ total: 0 }) === 'Кому звонить', 'eyebrow empty')

/* —— критические сценарии —— */
const cleared = pickCallTodayEntryForClient(
  [
    {
      id: 'm1',
      client_id: 'x',
      status: 'ok',
      outcome: 'answered',
      staff_note: null,
      created_at: '2026-08-15T10:00:00.000Z',
    },
    {
      id: 'm0',
      client_id: 'x',
      status: 'ok',
      outcome: 'missed',
      staff_note: null,
      created_at: '2026-08-14T10:00:00.000Z',
    },
  ],
  { nowMs: now },
)
ok(cleared == null, 'answered clears older missed')

const inFlight = pickCallTodayEntryForClient(
  [
    {
      id: 'p1',
      client_id: 'y',
      status: 'ok',
      outcome: 'pending',
      staff_note: null,
      created_at: '2026-08-15T11:30:00.000Z',
    },
    {
      id: 'p0',
      client_id: 'y',
      status: 'ok',
      outcome: 'missed',
      staff_note: 'перезвонить',
      created_at: '2026-08-14T10:00:00.000Z',
    },
  ],
  { nowMs: now },
)
ok(inFlight == null, 'recent pending blocks queue')

const doneNote = pickCallTodayEntryForClient(
  [
    {
      id: 'd1',
      client_id: 'z',
      status: 'ok',
      outcome: 'answered',
      staff_note: 'отказ, не звонить',
      created_at: '2026-08-15T09:00:00.000Z',
    },
  ],
  { nowMs: now },
)
ok(doneNote == null, 'done note clears')

const keepCallbackAfterAnswer = pickCallTodayEntryForClient(
  [
    {
      id: 'k1',
      client_id: 'k',
      status: 'ok',
      outcome: 'answered',
      staff_note: 'перезвонить завтра',
      created_at: '2026-08-15T09:00:00.000Z',
    },
  ],
  { nowMs: now },
)
ok(keepCallbackAfterAnswer?.kind === 'note_callback', 'answered+callback note stays')

const archivedOut = buildCallTodayGlance(logs, {
  nowMs: now,
  archivedClientIds: ['a'],
})
ok(archivedOut.total === 1 && archivedOut.items[0].client_id === 'b', 'archived filtered')

if (failed) process.exit(1)
console.log('verify-sales-call-today: all passed')
