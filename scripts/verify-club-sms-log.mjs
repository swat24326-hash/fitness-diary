/**
 * node scripts/verify-club-sms-log.mjs
 */
import {
  buildClubSmsLogInsertRow,
  clampClubSmsLogSinceDays,
  clubSmsLogSinceIso,
  filterClubSmsLogRowsByStatus,
  isClubSmsLogSuccessRow,
  normalizeClubSmsLogScenario,
  normalizeClubSmsLogStatus,
  shapeClubSmsLogApiRow,
  summarizeClubSmsLogRows,
  truncateClubSmsError,
  truncateClubSmsPreview,
  CLUB_SMS_LOG_ERROR_MAX,
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
ok(clubSmsLogSinceIso('2026-07-22', 1) === '2026-07-21T21:00:00.000Z', 'since today = Moscow midnight')
ok(clubSmsLogSinceIso('2026-07-22', 14) === '2026-07-08T21:00:00.000Z', 'since 14 days window Moscow')

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
ok(built.row.status === 'ok' && built.row.error_message === null, 'insert default status ok')

const failBuilt = buildClubSmsLogInsertRow({
  club_id: 'c1',
  client_id: 'cli1',
  status: 'fail',
  error_message: 'нет сети',
  message_preview: 'Привет',
})
ok(failBuilt.ok && failBuilt.row.status === 'fail' && failBuilt.row.error_message === 'нет сети', 'insert fail')

ok(buildClubSmsLogInsertRow({ club_id: '', client_id: 'x' }).ok === false, 'reject empty club')

ok(normalizeClubSmsLogStatus('fail') === 'fail', 'status fail')
ok(normalizeClubSmsLogStatus(null) === 'ok', 'status default ok')
ok(truncateClubSmsError('e'.repeat(CLUB_SMS_LOG_ERROR_MAX + 10)).length <= CLUB_SMS_LOG_ERROR_MAX, 'error truncated')

const shaped = shapeClubSmsLogApiRow(
  {
    id: '1',
    club_id: 'c1',
    client_id: 'cli1',
    sent_by: 'u1',
    scenario: 'stale',
    message_preview: 'hi',
    status: 'fail',
    error_message: 'bad phone',
    created_at: '2026-07-22T10:00:00.000Z',
  },
  { clientName: 'Иванов', sentByName: 'Менеджер' },
)
ok(shaped?.client_name === 'Иванов' && shaped?.sent_by_name === 'Менеджер', 'shape names')
ok(shaped?.status === 'fail' && shaped?.error_message === 'bad phone', 'shape fail')
ok(!isClubSmsLogSuccessRow(shaped), 'fail is not success mark')
ok(isClubSmsLogSuccessRow({ status: 'ok' }), 'ok is success mark')

const rows = [{ status: 'ok' }, { status: 'fail' }, { status: 'ok' }]
ok(summarizeClubSmsLogRows(rows).ok === 2 && summarizeClubSmsLogRows(rows).fail === 1, 'summarize')
ok(filterClubSmsLogRowsByStatus(rows, 'fail').length === 1, 'filter fail')
ok(filterClubSmsLogRowsByStatus(rows, 'ok').length === 2, 'filter ok')
ok(filterClubSmsLogRowsByStatus(rows, 'all').length === 3, 'filter all')

if (failed) process.exit(1)
console.log('\nverify-club-sms-log: all passed')
