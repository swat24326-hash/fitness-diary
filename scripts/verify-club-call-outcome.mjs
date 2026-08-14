/**
 * node scripts/verify-club-call-outcome.mjs
 */
import {
  buildClubCallFinishPatch,
  clubCallJournalStatusLabel,
  deriveClubCallOutcome,
  moiZvonkiWebhookSecretMatches,
  normalizeCallOutcomePhone,
  normalizeClubCallRecordingUrl,
  parseMoiZvonkiWebhookBody,
  pickClubCallLogRowForFinish,
  shapeCallFinishFromMoiZvonkiEvent,
} from '../src/lib/admin/clubCallOutcomeCore.js'
import { summarizeClubCallLogRows } from '../src/lib/admin/clubCallLogCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeCallOutcomePhone('89532966840') === '79532966840', 'phone 8→7')
ok(deriveClubCallOutcome({ answered: 1, duration: 40 }).outcome === 'answered', 'answered')
ok(deriveClubCallOutcome({ answered: 0, duration: 2 }).outcome === 'short', 'short')
ok(deriveClubCallOutcome({ answered: 0, duration: 28 }).outcome === 'missed', 'missed')

ok(clubCallJournalStatusLabel({ status: 'ok' }) === 'Команда ушла', 'label command')
ok(clubCallJournalStatusLabel({ status: 'ok', outcome: 'short', duration_sec: 2 }).includes('Короткий'), 'label short')
ok(clubCallJournalStatusLabel({ status: 'fail' }) === 'Ошибка', 'label fail')

const parsed = parseMoiZvonkiWebhookBody({
  webhook: { action: 'call.finish', user_login: 'a@b.ru', account_id: '1' },
  event: {
    client_number: '89532966840',
    answered: 0,
    duration: 3,
    start_time: 1720000000,
    end_time: 1720000003,
    db_call_id: 99,
    event_pbx_call_id: 'pbx1',
    recording: 'https://fitcity.moizvonki.ru/rec/abc.mp3',
  },
})
ok(parsed.ok && parsed.action === 'call.finish', 'parse finish')
const finish = shapeCallFinishFromMoiZvonkiEvent(parsed.event)
ok(finish.phone === '79532966840' && finish.outcome === 'short', 'shape finish short')
ok(
  finish.recording_url === 'https://fitcity.moizvonki.ru/rec/abc.mp3',
  'shape recording url',
)
const patch = buildClubCallFinishPatch(finish)
ok(patch.outcome === 'short' && patch.duration_sec === 3 && patch.finished_at, 'patch')
ok(patch.recording_url === finish.recording_url, 'patch recording')
ok(normalizeClubCallRecordingUrl('/rec/a.mp3', 'https://fitcity.moizvonki.ru') === 'https://fitcity.moizvonki.ru/rec/a.mp3', 'relative recording')
ok(
  shapeCallFinishFromMoiZvonkiEvent({
    client_number: '7999',
    answered: 1,
    duration: 10,
    record_url: 'https://x.test/r.mp3',
  }).recording_url === 'https://x.test/r.mp3',
  'shape record_url alias',
)

const created = new Date(Date.UTC(2026, 7, 14, 11, 40, 0)).toISOString()
const match = pickClubCallLogRowForFinish(
  [
    {
      id: 'a',
      phone: '79532966840',
      status: 'ok',
      created_at: created,
      finished_at: null,
    },
  ],
  { phone: '89532966840', start_time_ms: Date.parse(created) + 60_000 },
)
ok(match?.id === 'a', 'pick match')

ok(moiZvonkiWebhookSecretMatches('1234567890123456', '1234567890123456'), 'secret ok')
ok(!moiZvonkiWebhookSecretMatches('short', 'short'), 'secret too short rejected')

const sum = summarizeClubCallLogRows([
  { status: 'ok', outcome: 'pending' },
  { status: 'ok', outcome: 'short' },
  { status: 'ok', outcome: 'answered' },
  { status: 'fail' },
])
ok(sum.ok === 3 && sum.fail === 1 && sum.short === 1 && sum.answered === 1, 'summary outcomes')

if (failed) process.exit(1)
console.log('verify-club-call-outcome: all passed')
