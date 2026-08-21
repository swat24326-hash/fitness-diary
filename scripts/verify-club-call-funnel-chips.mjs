/**
 * node scripts/verify-club-call-funnel-chips.mjs
 */
import {
  CLUB_CALL_FUNNEL_CHIPS,
  CLUB_CALL_SHEET_NOTE_CHIPS,
  clubCallSheetNoteFromChip,
  composeClubCallFunnelNote,
  isClubCallFunnelCloseChip,
  isClubCallFunnelNoteReady,
  isClubCallFunnelOpenChip,
  matchClubCallCallbackHorizon,
  matchClubCallFunnelChip,
  normalizeClubCallFunnelChipId,
  resolveClubCallCallbackOn,
} from '../src/lib/admin/clubCallFunnelChipsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(CLUB_CALL_FUNNEL_CHIPS.length >= 8, 'catalog size')
ok(CLUB_CALL_SHEET_NOTE_CHIPS === CLUB_CALL_FUNNEL_CHIPS, 'sheet alias = funnel')
ok(CLUB_CALL_FUNNEL_CHIPS.some((c) => c.id === 'no_answer'), 'no_answer')
ok(CLUB_CALL_FUNNEL_CHIPS.some((c) => c.id === 'callback_later' && c.needsCallbackOn), 'callback_later needs date')
ok(CLUB_CALL_FUNNEL_CHIPS.some((c) => c.id === 'bought' && c.kind === 'close'), 'bought close')
ok(isClubCallFunnelOpenChip('waiting_offer'), 'open chip')
ok(isClubCallFunnelCloseChip('refused'), 'close chip')
ok(normalizeClubCallFunnelChipId('bought') === 'bought', 'normalize ok')
ok(normalizeClubCallFunnelChipId('nope') === null, 'normalize bad')

ok(clubCallSheetNoteFromChip('  Не взял — перезвонить  ') === 'Не взял — перезвонить', 'trim chip')
ok(clubCallSheetNoteFromChip('abcdef', 4) === 'abcd', 'max len')

ok(
  composeClubCallFunnelNote({ chipId: 'no_answer' }) === 'Не взял — перезвонить',
  'compose open',
)
ok(
  composeClubCallFunnelNote({ chipId: 'callback_later', callbackOn: '2026-08-22' }) ===
    'Перезвонить · до 22.08.2026',
  'compose later',
)
ok(composeClubCallFunnelNote({ chipId: 'callback_later' }) === null, 'later without date')
ok(isClubCallFunnelNoteReady({ chipId: 'busy' }), 'ready busy')
ok(!isClubCallFunnelNoteReady({ chipId: 'callback_later' }), 'not ready later')
ok(
  isClubCallFunnelNoteReady({ chipId: 'callback_later', callbackOn: '2026-08-25' }),
  'ready later',
)
ok(isClubCallFunnelNoteReady({ customText: 'свой текст' }), 'ready free text')

ok(resolveClubCallCallbackOn('2026-08-20', '1d', '') === '2026-08-21', 'horizon 1d')
ok(resolveClubCallCallbackOn('2026-08-20', 'custom', '2026-09-01') === '2026-09-01', 'horizon custom')

ok(
  matchClubCallFunnelChip({ staff_note_chip_id: 'bought' }).chipId === 'bought',
  'match by id',
)
ok(
  matchClubCallFunnelChip({ staff_note: 'Ждёт условия / цену' }).chipId === 'waiting_offer',
  'match legacy note',
)
ok(
  matchClubCallFunnelChip({ staff_note: 'Перезвонить · до 25.08.2026' }).callbackOn ===
    '2026-08-25',
  'match later from text',
)
ok(
  matchClubCallCallbackHorizon('2026-08-21', '2026-08-20').horizonId === '1d',
  'horizon match 1d',
)

if (failed) process.exit(1)
console.log('verify-club-call-funnel-chips: all passed')
