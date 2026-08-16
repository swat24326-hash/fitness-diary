/**
 * node scripts/verify-club-call-sheet-note-chips.mjs
 */
import {
  CLUB_CALL_SHEET_NOTE_CHIPS,
  clubCallSheetNoteFromChip,
} from '../src/lib/admin/clubCallSheetNoteChipsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(CLUB_CALL_SHEET_NOTE_CHIPS.length >= 3, 'chips present')
ok(
  CLUB_CALL_SHEET_NOTE_CHIPS.some((c) => /не взял/i.test(c.note)),
  'missed chip',
)
ok(clubCallSheetNoteFromChip('  Не взял — перезвонить  ') === 'Не взял — перезвонить', 'trim chip')
ok(clubCallSheetNoteFromChip('abcdef', 4) === 'abcd', 'max len')

if (failed) process.exit(1)
console.log('verify-club-call-sheet-note-chips: all passed')
