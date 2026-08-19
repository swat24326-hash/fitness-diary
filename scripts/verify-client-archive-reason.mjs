/**
 * node scripts/verify-client-archive-reason.mjs
 */
import {
  ARCHIVE_REASON_CHIPS,
  ARCHIVE_REASON_MAX_LEN,
  ARCHIVE_REASON_OTHER_ID,
  buildArchiveEnterFields,
  buildArchiveReasonOnlyFields,
  buildArchiveRestoreFields,
  clientHasArchiveReason,
  clientHasStaleArchiveReason,
  clientNeedsArchiveReason,
  composeArchiveReason,
  formatArchiveReasonDisplay,
  getClientArchiveReason,
  isArchiveReasonReady,
  matchArchiveReasonChip,
  normalizeArchiveReasonText,
  resolveArchiveReasonModalState,
  withArchiveRestore,
} from '../src/lib/clientArchiveReasonCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(ARCHIVE_REASON_MAX_LEN === 200, 'max len')
ok(ARCHIVE_REASON_CHIPS.length === 9, 'chips count')
ok(!ARCHIVE_REASON_CHIPS.some((c) => c.id === 'not_renewed'), 'not_renewed not in UI chips')
ok(ARCHIVE_REASON_CHIPS.some((c) => c.id === 'never_return'), 'never_return chip')
ok(ARCHIVE_REASON_CHIPS.some((c) => c.id === 'return_later'), 'return_later chip')
ok(ARCHIVE_REASON_CHIPS.some((c) => c.id === 'health'), 'health chip')

ok(normalizeArchiveReasonText('  hello  ') === 'hello', 'normalize trim')
ok(normalizeArchiveReasonText('') === null, 'normalize empty')
ok(normalizeArchiveReasonText('a'.repeat(250)).length === 200, 'normalize slice')

ok(composeArchiveReason({ chipId: 'no_show' }) === 'Не ходит / пропал', 'chip label')
ok(composeArchiveReason({ chipId: 'never_return' }) === 'Не вернётся', 'never_return label')
ok(composeArchiveReason({ chipId: 'other', customText: '  Уехал  ' }) === 'Уехал', 'other + text')
ok(composeArchiveReason({ chipId: 'other', customText: '' }) === null, 'other empty')
ok(composeArchiveReason({ customText: 'Свой текст' }) === 'Свой текст', 'free text')

ok(isArchiveReasonReady('ok'), 'ready yes')
ok(!isArchiveReasonReady('  '), 'ready no')

const enter = buildArchiveEnterFields('Не ходит / пропал', '2026-08-16T10:00:00.000Z')
ok(enter.ok === true, 'enter ok')
ok(enter.patch?.archived_at === '2026-08-16T10:00:00.000Z', 'enter archived_at')
ok(enter.patch?.archive_reason === 'Не ходит / пропал', 'enter reason')
ok(enter.patch?.archive_reason_at === '2026-08-16T10:00:00.000Z', 'enter reason_at')
ok(buildArchiveEnterFields('').ok === false, 'enter requires reason')

const restore = buildArchiveRestoreFields()
ok(restore.archived_at === null && restore.archive_reason === null && restore.archive_reason_at === null, 'restore clears')

const restoredRow = withArchiveRestore(
  { id: 'c1', name: 'Иванов', archived_at: '2026-08-01T00:00:00.000Z', archive_reason: 'Недоволен', archive_reason_at: 'x' },
  { trainer_id: 't1' },
)
ok(restoredRow.archived_at === null && restoredRow.archive_reason === null, 'withArchiveRestore clears reason')
ok(restoredRow.trainer_id === 't1' && restoredRow.name === 'Иванов', 'withArchiveRestore keeps extras')
ok(clientHasStaleArchiveReason({ archived_at: null, archive_reason: 'Переехал / другой зал' }), 'stale reason')
ok(!clientHasStaleArchiveReason({ archived_at: 'x', archive_reason: 'Переехал / другой зал' }), 'archived not stale')
ok(!clientHasStaleArchiveReason({ archived_at: null }), 'active clean')
ok(clientHasArchiveReason({ archive_reason: 'Недоволен' }), 'has reason helper')

const only = buildArchiveReasonOnlyFields('Дорого / нет денег', '2026-08-16T11:00:00.000Z')
ok(only.ok === true && only.patch.archive_reason === 'Дорого / нет денег', 'reason-only')
ok(!('archived_at' in only.patch), 'reason-only keeps archived_at untouched')

ok(clientNeedsArchiveReason({ archived_at: 'x' }) === true, 'needs reason')
ok(clientNeedsArchiveReason({ archived_at: 'x', archive_reason: 'Переехал / другой зал' }) === false, 'has reason')
ok(clientNeedsArchiveReason({ archived_at: null }) === false, 'active no need')

ok(formatArchiveReasonDisplay({ archived_at: 'x' }) === 'Без причины', 'display missing')
ok(formatArchiveReasonDisplay({ archived_at: 'x', archive_reason: 'Недоволен' }) === 'Недоволен', 'display text')
ok(formatArchiveReasonDisplay({}) === null, 'display active null')
ok(getClientArchiveReason({ archive_reason: '  A  ' }) === 'A', 'get reason')

const matched = matchArchiveReasonChip('Не ходит / пропал')
ok(matched.chipId === 'no_show' && matched.customText === '', 'match chip')
const otherMatch = matchArchiveReasonChip('Своя причина')
ok(otherMatch.chipId === ARCHIVE_REASON_OTHER_ID && otherMatch.customText === 'Своя причина', 'match other')

const legacyRenewed = matchArchiveReasonChip('Закончил / не продлил')
ok(legacyRenewed.chipId === 'not_renewed' && legacyRenewed.customText === '', 'legacy not_renewed match')

const legacyExpensive = matchArchiveReasonChip('Дорого / финансы')
ok(legacyExpensive.chipId === 'expensive' && legacyExpensive.customText === '', 'legacy expensive label')

const modalLegacy = resolveArchiveReasonModalState('Закончил / не продлил')
ok(
  modalLegacy.chipId === ARCHIVE_REASON_OTHER_ID && modalLegacy.customText === 'Закончил / не продлил',
  'legacy → other in modal',
)
const modalChip = resolveArchiveReasonModalState('Не вернётся')
ok(modalChip.chipId === 'never_return' && modalChip.customText === '', 'active chip in modal')

if (failed) process.exit(1)
console.log('verify-client-archive-reason: all ok')
