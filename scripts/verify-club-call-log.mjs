/**
 * node scripts/verify-club-call-log.mjs
 */
import {
  buildClubCallLogInsertRow,
  buildClubCallStaffNotePatch,
  clampClubCallLogSinceDays,
  clubCallLogSinceIso,
  filterClubCallLogRowsByStatus,
  normalizeClubCallLogStatus,
  normalizeClubCallStaffNote,
  shapeClubCallLogApiRow,
  summarizeClubCallLogRows,
  truncateClubCallError,
  truncateClubCallPhone,
  CLUB_CALL_LOG_ERROR_MAX,
  CLUB_CALL_LOG_STAFF_NOTE_MAX,
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
ok(clubCallLogSinceIso('2026-08-13', 1) === '2026-08-12T21:00:00.000Z', 'since today = Moscow midnight')
ok(clubCallLogSinceIso('2026-08-13', 14) === '2026-07-30T21:00:00.000Z', 'since 14 days window Moscow')

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

ok(normalizeClubCallStaffNote('  перезвонить  ').ok && normalizeClubCallStaffNote('  перезвонить  ').note === 'перезвонить', 'note trim')
ok(normalizeClubCallStaffNote('').note === null, 'note empty → null')
ok(normalizeClubCallStaffNote('x'.repeat(CLUB_CALL_LOG_STAFF_NOTE_MAX + 1)).ok === false, 'note too long')
ok(
  shapeClubCallLogApiRow({
    id: '4',
    club_id: 'c1',
    client_id: 'cli1',
    status: 'ok',
    staff_note: ' думает про УК ',
  }).staff_note === 'думает про УК',
  'shape staff_note',
)
const notePatch = buildClubCallStaffNotePatch({
  club_id: 'c1',
  log_id: 'l1',
  staff_note: 'ок',
  staff_note_by: 'u1',
})
ok(notePatch.ok && notePatch.patch.staff_note === 'ок' && notePatch.patch.staff_note_by === 'u1', 'note patch')
ok(buildClubCallStaffNotePatch({ club_id: 'c1', log_id: 'l1', staff_note: '' }).patch.staff_note === null, 'note clear')

const funnelPatch = buildClubCallStaffNotePatch({
  club_id: 'c1',
  log_id: 'l1',
  staff_note: 'Перезвонить · до 22.08.2026',
  staff_note_chip_id: 'callback_later',
  callback_on: '2026-08-22',
  staff_note_by: 'u1',
})
ok(
  funnelPatch.ok &&
    funnelPatch.patch.staff_note_chip_id === 'callback_later' &&
    funnelPatch.patch.callback_on === '2026-08-22',
  'funnel chip patch',
)
ok(
  buildClubCallStaffNotePatch({
    club_id: 'c1',
    log_id: 'l1',
    staff_note: 'Не взял — перезвонить · вечером',
    staff_note_chip_id: 'no_answer',
  }).patch.staff_note === 'Не взял — перезвонить · вечером',
  'chip keeps draft tail',
)
ok(
  buildClubCallStaffNotePatch({
    club_id: 'c1',
    log_id: 'l1',
    staff_note: '',
    staff_note_chip_id: 'callback_today',
  }).patch.callback_on != null,
  'callback_today fills date',
)
ok(
  buildClubCallStaffNotePatch({
    club_id: 'c1',
    log_id: 'l1',
    staff_note: '',
  }).patch.staff_note_chip_id === null &&
    buildClubCallStaffNotePatch({
      club_id: 'c1',
      log_id: 'l1',
      staff_note: '',
    }).patch.callback_on === null,
  'clear note clears chip+callback',
)
ok(
  shapeClubCallLogApiRow({
    id: '5',
    club_id: 'c1',
    client_id: 'cli1',
    status: 'ok',
    staff_note: 'Отказ',
    staff_note_chip_id: 'refused',
    callback_on: null,
  }).staff_note_chip_id === 'refused',
  'shape chip id',
)

if (failed) process.exit(1)
console.log('verify-club-call-log: all passed')
