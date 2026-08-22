/**
 * node scripts/verify-club-call-shift-summary.mjs
 */
import {
  buildClubCallShiftSummary,
  buildClubCallShiftSummaryCards,
  filterOutreachLogsForDay,
  pickLatestCallNoteRows,
  resolveClubCallShiftChipId,
} from '../src/lib/admin/clubCallShiftSummaryCore.js'
import { clubOpsDayBoundsUtc } from '../src/lib/dateRu.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const day = '2026-08-22'
const { gte, lt } = clubOpsDayBoundsUtc(day)

/** До полуночи UTC, но уже 22.08 по МСК — не должен выпадать. */
const earlyMsk = {
  status: 'ok',
  outcome: 'missed',
  created_at: '2026-08-21T22:30:00.000Z',
  client_id: 'early',
  staff_note_chip_id: 'callback_today',
}
ok(earlyMsk.created_at >= gte && earlyMsk.created_at < lt, 'early row in MSK bounds')
ok(filterOutreachLogsForDay([earlyMsk], day).length === 1, 'MSK day filter keeps early UTC stamp')

const calls = [
  earlyMsk,
  {
    status: 'ok',
    outcome: 'answered',
    duration_sec: 40,
    created_at: '2026-08-22T08:00:00.000Z',
    client_id: 'c1',
    staff_note_chip_id: 'bought',
  },
  {
    status: 'ok',
    outcome: 'missed',
    created_at: '2026-08-22T09:00:00.000Z',
    client_id: 'c2',
    staff_note_chip_id: 'callback_today',
  },
  {
    status: 'ok',
    outcome: 'pending',
    created_at: '2026-08-22T10:00:00.000Z',
    client_id: 'c2',
    staff_note_chip_id: 'bought',
  },
  {
    status: 'ok',
    outcome: 'answered',
    created_at: '2026-08-22T11:00:00.000Z',
    client_id: 'c3',
    staff_note: 'Ждёт условия / цену',
  },
  {
    status: 'ok',
    outcome: 'answered',
    created_at: '2026-08-21T10:00:00.000Z',
    client_id: 'old',
    staff_note_chip_id: 'refused',
  },
]

ok(resolveClubCallShiftChipId(calls[4]) === 'waiting_offer', 'chip from staff_note text')
ok(pickLatestCallNoteRows(filterOutreachLogsForDay(calls, day)).length === 4, 'latest notes: early+c1+c2+c3')

const sms = [
  { status: 'ok', created_at: '2026-08-22T11:00:00.000Z', client_id: 'c1' },
  { status: 'fail', created_at: '2026-08-22T12:00:00.000Z', client_id: 'c4' },
  { status: 'ok', created_at: '2026-08-21T12:00:00.000Z', client_id: 'x' },
]

ok(filterOutreachLogsForDay(calls, day).length === 5, 'filter day calls (MSK)')

const s = buildClubCallShiftSummary(calls, sms, { day })
ok(s.day === day, 'day set')
ok(s.calls === 5 && s.answered === 2 && s.missed === 2 && s.pending === 1, 'call outcomes')
ok(s.sms === 2 && s.sms_ok === 1 && s.sms_fail === 1, 'sms day')
/** c2 latest = bought → не followup; early + c3 waiting */
ok(s.followup_clients === 2 && s.callback_open === 2, 'followup after latest wins')
ok(s.closed_clients === 2 && s.bought === 2, 'closed latest: c1 + c2 bought')
ok(s.has_activity && s.is_hot && s.needs_followup, 'flags hot/followup')

const empty = buildClubCallShiftSummary([], [], { day })
ok(!empty.has_activity && !empty.is_hot && empty.calls === 0, 'empty day')

const cards = buildClubCallShiftSummaryCards(s, { journalHref: '/club/call-log' })
ok(cards.length === 4, 'four cards')
ok(cards.find((c) => c.key === 'followup')?.count === 2, 'followup card unique')
ok(String(cards.find((c) => c.key === 'sms')?.to).includes('tab=sms'), 'sms deep link')
ok(String(cards.find((c) => c.key === 'closed')?.to).includes('tab=call-stats'), 'stats deep link')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-club-call-shift-summary: all ok')
