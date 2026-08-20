/**
 * node scripts/verify-client-archive-expected-return.mjs
 */
import {
  aggregateArchiveReasonMix,
  archiveReasonMixGroupId,
} from '../src/lib/admin/clientRetentionArchiveReasonCore.js'
import {
  buildArchiveEnterFields,
  buildArchiveReasonOnlyFields,
  buildArchiveRestoreFields,
  isArchiveReasonModalReady,
  normalizeArchiveReasonInput,
} from '../src/lib/clientArchiveReasonCore.js'
import {
  ARCHIVE_RETURN_HORIZONS,
  composeReturnLaterReason,
  formatExpectedReturnHint,
  getClientExpectedReturnOn,
  isReturnLaterReasonText,
  matchReturnHorizon,
  normalizeExpectedReturnOn,
  parseExpectedReturnOnFromReason,
  resolveExpectedReturnOn,
} from '../src/lib/clientArchiveExpectedReturnCore.js'
import { addMonthsToIso } from '../src/lib/dateRu.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(ARCHIVE_RETURN_HORIZONS.length === 5, 'horizons count')
ok(normalizeExpectedReturnOn('2026-10-20') === '2026-10-20', 'normalize date')
ok(normalizeExpectedReturnOn('bad') === null, 'normalize bad')
ok(resolveExpectedReturnOn('2026-08-20', '1m') === '2026-09-20', '1m')
ok(resolveExpectedReturnOn('2026-08-20', '3m') === '2026-11-20', '3m')
ok(resolveExpectedReturnOn('2026-08-20', '6m') === '2027-02-20', '6m')
ok(resolveExpectedReturnOn('2026-08-20', 'custom', '2026-12-01') === '2026-12-01', 'custom')
ok(resolveExpectedReturnOn('2026-08-20', 'custom', '') === null, 'custom empty')
ok(composeReturnLaterReason('2026-10-20') === 'Вернётся позже · до 20.10.2026', 'compose')
ok(isReturnLaterReasonText('Вернётся позже · до 20.10.2026'), 'is return later')
ok(parseExpectedReturnOnFromReason('Вернётся позже · до 20.10.2026') === '2026-10-20', 'parse from reason')
ok(getClientExpectedReturnOn({ expected_return_on: '2026-10-20' }) === '2026-10-20', 'from column')
ok(
  getClientExpectedReturnOn({ archive_reason: 'Вернётся позже · до 15.09.2026' }) === '2026-09-15',
  'from reason fallback',
)
ok(
  formatExpectedReturnHint(
    { archived_at: 'x', expected_return_on: '2026-10-20' },
    '2026-08-20',
  ) === 'Ждём до 20.10.2026',
  'hint future',
)
ok(
  formatExpectedReturnHint(
    { archived_at: 'x', expected_return_on: '2026-08-01' },
    '2026-08-20',
  ) === 'Срок прошёл (01.08.2026) — пора связаться',
  'hint overdue',
)
ok(matchReturnHorizon('2026-09-20', '2026-08-20').horizonId === '1m', 'match 1m')
ok(matchReturnHorizon('2026-12-25', '2026-08-20').horizonId === 'custom', 'match custom')

// --- Критические сценарии ---
ok(
  archiveReasonMixGroupId('Вернётся позже · до 20.10.2026') === 'return_later',
  'CRIT mix: dated return_later → group return_later',
)
const mix = aggregateArchiveReasonMix([
  { archive_reason: 'Вернётся позже · до 20.10.2026' },
  { archive_reason: 'Вернётся позже · до 01.11.2026' },
  { archive_reason: 'Недоволен' },
])
ok(mix.byGroup.return_later === 2, 'CRIT mix: two dated later count as one group')
ok(mix.byLabel['Вернётся позже'] === 2, 'CRIT mix: label without date suffix')
ok(mix.byGroup.unhappy === 1, 'CRIT mix: other chip separate')

ok(resolveExpectedReturnOn('2026-01-31', '1m') === '2026-02-28', 'CRIT month-end Jan31→Feb28')
ok(addMonthsToIso('2026-03-31', 1) === '2026-04-30', 'CRIT month-end Mar31→Apr30')

const switchAway = buildArchiveReasonOnlyFields(
  { reason: 'Не ходит / пропал', expectedReturnOn: '2026-10-20' },
  '2026-08-20T12:00:00.000Z',
)
ok(switchAway.ok === true, 'CRIT switch away from later ok')
ok(switchAway.patch.expected_return_on === null, 'CRIT switch away clears expected_return_on')
ok(switchAway.patch.archive_reason === 'Не ходит / пропал', 'CRIT switch away reason')

const switchToLaterNoDate = buildArchiveReasonOnlyFields({ reason: 'Вернётся позже' })
ok(switchToLaterNoDate.ok === false, 'CRIT switch to later without date fails')

const fromString = normalizeArchiveReasonInput('Вернётся позже · до 15.09.2026')
ok(fromString.expectedReturnOn === '2026-09-15', 'CRIT string payload parses date')
const enterFromString = buildArchiveEnterFields('Вернётся позже · до 15.09.2026', '2026-08-20T12:00:00.000Z')
ok(enterFromString.ok === true && enterFromString.patch.expected_return_on === '2026-09-15', 'CRIT enter from string alone')

ok(
  isArchiveReasonModalReady({ chipId: 'return_later', expectedReturnOn: null }) === false,
  'CRIT modal not ready without horizon',
)
ok(
  isArchiveReasonModalReady({ chipId: 'return_later', expectedReturnOn: '2026-10-01' }) === true,
  'CRIT modal ready with horizon',
)
ok(isArchiveReasonModalReady({ chipId: 'health' }) === true, 'CRIT other chip ready without date')

ok(
  formatExpectedReturnHint(
    { archived_at: 'x', expected_return_on: '2026-08-20' },
    '2026-08-20',
  ) === 'Ждём сегодня (20.08.2026)',
  'CRIT hint today',
)
ok(
  formatExpectedReturnHint({ archived_at: 'x', archive_reason: 'Вернётся позже' }, '2026-08-20') ===
    'Срок возврата не указан',
  'CRIT legacy later without date',
)

const restored = buildArchiveRestoreFields()
ok(
  restored.expected_return_on === null && restored.archive_reason === null && restored.archived_at === null,
  'CRIT restore clears triad',
)

const enterHealth = buildArchiveEnterFields(
  { reason: 'Здоровье', expectedReturnOn: '2026-12-01' },
  '2026-08-20T12:00:00.000Z',
)
ok(enterHealth.patch.expected_return_on === null, 'CRIT non-later ignores stray date')

const editLater = matchReturnHorizon('2026-10-20', '2026-09-01')
ok(editLater.horizonId === 'custom' && editLater.customDate === '2026-10-20', 'CRIT reopen later week → custom+date')

if (failed) process.exit(1)
console.log('verify-client-archive-expected-return: all ok')
