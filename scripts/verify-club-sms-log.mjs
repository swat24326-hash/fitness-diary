/**
 * node scripts/verify-club-sms-log.mjs
 */
import {
  buildClubSmsLogInsertRow,
  clampClubSmsLogSinceDays,
  clubSmsLogSinceIso,
  normalizeClubSmsLogScenario,
  shapeClubSmsLogApiRow,
  truncateClubSmsPreview,
  CLUB_SMS_LOG_PREVIEW_MAX,
} from '../src/lib/admin/clubSmsLogCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeClubSmsLogScenario('expired_recent') === 'expired_recent', 'scenario ok')
ok(normalizeClubSmsLogScenario('hack') === 'custom', 'bad scenario → custom')
ok(clampClubSmsLogSinceDays(14) === 14, 'since 14')
ok(clampClubSmsLogSinceDays(0) === 14, 'since 0 → default')
ok(clampClubSmsLogSinceDays(999) === 90, 'since capped')
ok(clubSmsLogSinceIso('2026-07-22', 1).startsWith('2026-07-22'), 'since today')
ok(clubSmsLogSinceIso('2026-07-22', 14).startsWith('2026-07-09'), 'since 14 days window start')

const long = 'x'.repeat(CLUB_SMS_LOG_PREVIEW_MAX + 20)
ok(truncateClubSmsPreview(long).length <= CLUB_SMS_LOG_PREVIEW_MAX, 'preview truncated')

const built = buildClubSmsLogInsertRow({
  club_id: 'c1',
  client_id: 'cli1',
  sent_by: 'u1',
  scenario: 'expired_recent',
  message_preview: 'Привет',
})
ok(built.ok === true, 'insert row ok')
ok(built.row.scenario === 'expired_recent', 'insert scenario')
ok(built.row.sent_by === 'u1', 'insert sent_by')

ok(buildClubSmsLogInsertRow({ club_id: '', client_id: 'x' }).ok === false, 'reject empty club')

const shaped = shapeClubSmsLogApiRow(
  {
    id: '1',
    club_id: 'c1',
    client_id: 'cli1',
    sent_by: 'u1',
    scenario: 'stale',
    message_preview: 'hi',
    created_at: '2026-07-22T10:00:00.000Z',
  },
  { clientName: 'Иванов', sentByName: 'Менеджер' },
)
ok(shaped?.client_name === 'Иванов' && shaped?.sent_by_name === 'Менеджер', 'shape names')

if (failed) process.exit(1)
console.log('\nverify-club-sms-log: all passed')
