/**
 * node scripts/verify-club-call-recording-ui.mjs
 */
import { resolveClubCallRecordingUi } from '../src/lib/admin/clubCallRecordingUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const url = 'https://fitcity.moizvonki.ru/rec/a.mp3'

ok(resolveClubCallRecordingUi({ status: 'ok', outcome: 'pending' }).tone === 'none', 'pending → none')
ok(resolveClubCallRecordingUi({ status: 'fail' }).tone === 'none', 'fail → none')

const bright = resolveClubCallRecordingUi({
  status: 'ok',
  outcome: 'answered',
  recording_url: url,
})
ok(bright.tone === 'bright' && bright.playable, 'answered + url → bright')

const paleMiss = resolveClubCallRecordingUi({
  status: 'ok',
  outcome: 'missed',
  recording_url: url,
})
ok(paleMiss.tone === 'pale' && paleMiss.playable, 'missed + url → pale playable')

const paleShort = resolveClubCallRecordingUi({
  status: 'ok',
  outcome: 'short',
  recording_url: url,
})
ok(paleShort.tone === 'pale', 'short + url → pale')

const emptyMiss = resolveClubCallRecordingUi({ status: 'ok', outcome: 'missed' })
ok(emptyMiss.tone === 'empty' && !emptyMiss.playable, 'missed without url → empty')

const emptyTalk = resolveClubCallRecordingUi({ status: 'ok', outcome: 'answered' })
ok(emptyTalk.tone === 'empty' && !emptyTalk.playable, 'answered without url → empty')

ok(
  resolveClubCallRecordingUi({ status: 'ok', answered: true, recording_url: url }).tone === 'bright',
  'answered flag + url → bright',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
