/**
 * node scripts/verify-club-call-log.mjs
 */
import {
  buildClubCallLogInsertRow,
  clampClubCallLogSinceDays,
  clubCallLogSinceIso,
  filterClubCallLogRowsByStatus,
  normalizeClubCallLogStatus,
  shapeClubCallLogApiRow,
  summarizeClubCallLogRows,
  truncateClubCallError,
  truncateClubCallPhone,
  CLUB_CALL_LOG_ERROR_MAX,
} from '../src/lib/admin/clubCallLogCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(clampClubCallLogSinceDays(14) === 14, 'since 14')
ok(clampClubCallLogSinceDays(0) === 14, 'since 0 → default')
ok(clampClubCallLogSinceDays(999) === 90, 'since capped')
ok(clubCallLogSinceIso('2026-08-13', 1).startsWith('2026-08-13'), 'since today')
ok(clubCallLogSinceIso('2026-08-13', 14).startsWith('2026-07-31'), 'since 14 days window')

ok(truncateClubCallPhone('+7 (999) 123-45-67') === '79991234567', 'phone digits')
ok(truncateClubCallError('e'.repeat(CLUB_CALL_LOG_ERROR_MAX + 10)).length <= CLUB_CALL_LOG_ERROR_MAX, 'error truncated')

const built = buildClubCallLogInsertRow({
  club_id: 'c1',
  client_id: 'cli1',
  sent_by: 'u1',
  phone: '89991234567',
})
ok(built.ok === true, 'insert row ok')
ok(built.row.phone === '89991234567' || built.row.phone === '79991234567', 'insert phone kept digits')
ok(built.row.status === 'ok' && built.row.error_message === null, 'insert default status ok')

const failBuilt = buildClubCallLogInsertRow({
  club_id: 'c1',
  client_id: 'cli1',
  status: 'fail',
  error_message: 'телефон офлайн',
  phone: '79991234567',
})
ok(failBuilt.ok && failBuilt.row.status === 'fail' && failBuilt.row.error_message === 'телефон офлайн', 'insert fail')

ok(buildClubCallLogInsertRow({ club_id: '', client_id: 'x' }).ok === false, 'reject empty club')
ok(normalizeClubCallLogStatus('fail') === 'fail', 'status fail')
ok(normalizeClubCallLogStatus(null) === 'ok', 'status default ok')

const shaped = shapeClubCallLogApiRow(
  {
    id: '1',
    club_id: 'c1',
    client_id: 'cli1',
    sent_by: 'u1',
    phone: '79991234567',
    status: 'fail',
    error_message: 'offline',
    created_at: '2026-08-13T10:00:00.000Z',
  },
  { clientName: 'Иванов', sentByName: 'Менеджер' },
)
ok(shaped.client_name === 'Иванов' && shaped.sent_by_name === 'Менеджер', 'shape names')
ok(shaped.status === 'fail' && shaped.error_message === 'offline', 'shape fail')
ok(
  shapeClubCallLogApiRow({
    id: '2',
    club_id: 'c1',
    client_id: 'cli1',
    status: 'ok',
    recording_url: 'https://fitcity.moizvonki.ru/r.mp3',
  }).recording_url === 'https://fitcity.moizvonki.ru/r.mp3',
  'shape recording',
)
ok(shapeClubCallLogApiRow({ id: '3', status: 'ok', recording_url: 'not-a-url' }).recording_url == null, 'shape bad recording')

const rows = [
  { status: 'ok' },
  { status: 'fail' },
  { status: 'ok' },
]
ok(summarizeClubCallLogRows(rows).ok === 2 && summarizeClubCallLogRows(rows).fail === 1, 'summary')
ok(filterClubCallLogRowsByStatus(rows, 'fail').length === 1, 'filter fail')
ok(filterClubCallLogRowsByStatus(rows, 'all').length === 3, 'filter all')

if (failed) process.exit(1)
console.log('verify-club-call-log: all passed')
