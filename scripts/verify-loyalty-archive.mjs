/**
 * node scripts/verify-loyalty-archive.mjs
 * Фаза F: архив burn_archive, переезд club_move, тексты модалки, не выдумываем 0.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import {
  detectLoyaltyArchiveBurn,
  detectLoyaltyClubMove,
  loyaltyArchiveWarnText,
  loyaltyBurnSurvivesRestore,
  loyaltyClubMoveWarnText,
  mergeClientAfterPush,
} from '../src/lib/loyalty/loyaltyClientMutationCore.js'
import { clubMoveConfirmMessage } from '../src/lib/admin/clientTrainerReassignCore.js'
import { shouldShowLoyaltyUi } from '../src/lib/loyalty/loyaltyGlanceUiCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const live = { id: 'c1', club_id: 'club-a', trainer_id: 't1', archived_at: null }
const archivedAt = '2026-08-19T10:00:00.000Z'

ok(
  detectLoyaltyArchiveBurn({
    before: live,
    after: { ...live, archived_at: archivedAt },
  }).write === true,
  '1 архив → burn_archive',
)
ok(
  detectLoyaltyArchiveBurn({
    before: live,
    after: { ...live, archived_at: archivedAt },
  }).at === archivedAt,
  '1b at = archived_at',
)
ok(
  detectLoyaltyArchiveBurn({
    before: { ...live, archived_at: archivedAt },
    after: { ...live, archived_at: archivedAt },
  }).write === false,
  '1c повторный push уже в архиве — нет второго burn',
)
ok(
  detectLoyaltyArchiveBurn({
    before: { ...live, archived_at: archivedAt },
    after: { ...live, archived_at: null },
  }).write === false,
  '2 restore не пишет burn',
)
ok(
  loyaltyBurnSurvivesRestore([
    { kind: 'burn_archive', at: archivedAt },
    { kind: 'redeem', at: '2026-01-01T00:00:00.000Z' },
  ]) === true,
  '2b restore не удаляет burn_archive',
)

ok(
  detectLoyaltyArchiveBurn({
    before: { ...live, archived_at: archivedAt },
    after: { ...live, archived_at: '2026-09-01T00:00:00.000Z' },
  }).write === false,
  '2c смена причины / тот же архив без выхода — не burn',
)

ok(
  detectLoyaltyClubMove({
    before: live,
    after: { ...live, trainer_id: 't2' },
    asOf: '2026-08-19',
    nowIso: archivedAt,
  }).write === false,
  '3 смена тренера без клуба — нет ledger',
)
ok(
  detectLoyaltyClubMove({
    before: live,
    after: { ...live, club_id: 'club-b' },
    asOf: '2026-08-19',
    nowIso: archivedAt,
  }).write === true,
  '4 смена клуба → club_move',
)
{
  const m = detectLoyaltyClubMove({
    before: live,
    after: { ...live, club_id: 'club-b' },
    asOf: '2026-08-19',
    nowIso: archivedAt,
  })
  ok(m.from === 'club-a' && m.to === 'club-b' && m.asOf === '2026-08-19', '4b from/to/as_of')
}

{
  const after = mergeClientAfterPush(live, { archived_at: archivedAt, archive_reason: 'Уехал' })
  ok(after.archived_at === archivedAt && after.club_id === 'club-a', '5 merge payload поверх before')
  ok(detectLoyaltyArchiveBurn({ before: live, after }).write === true, '5b merge ловит архив')
}

ok(
  loyaltyArchiveWarnText({ known: true, points: 150 }).includes('150'),
  '6 модалка показывает N баллов',
)
ok(
  !loyaltyArchiveWarnText({ known: false }).includes('0 баллов'),
  '6b неизвестно — не выдумываем 0',
)
ok(
  loyaltyArchiveWarnText({ known: true, points: 0 }).includes('нет'),
  '6c известный ноль — честно «нет»',
)
ok(
  loyaltyClubMoveWarnText({ known: true, points: 50 }).includes('50'),
  '7 переезд: N в confirm',
)
ok(
  clubMoveConfirmMessage({
    oldClubId: 'a',
    newClubId: 'b',
    trainerName: 'Иван',
    loyaltyNote: loyaltyClubMoveWarnText({ known: true, points: 50 }),
  }).includes('50'),
  '7b confirm склеивает предупреждение',
)

ok(!PUSH_ALLOWED_TABLES.has('loyalty_ledger'), '8 ledger не в sync очереди')

ok(
  detectLoyaltyClubMove({
    before: null,
    after: { id: 'c1', club_id: 'club-a' },
    asOf: '2026-08-19',
    nowIso: archivedAt,
  }).write === false,
  '8b insert клиента — не club_move',
)

ok(shouldShowLoyaltyUi({ id: 'c-tz', desk_hall: 'tz' }) === false, '10 ТЗ — нет предупреждения куша')
ok(shouldShowLoyaltyUi({ id: 'c-az', desk_hall: 'az' }) === false, '10b АЗ — нет предупреждения куша')
ok(
  shouldShowLoyaltyUi({
    id: 'c-pnk',
    lifecycle: 'pnk',
    pnk_stage: 'assigned',
    desk_hall: null,
  }) === false,
  '10c открытый ПНК — нет предупреждения куша',
)

{
  const push = readFileSync(join(root, 'api/_lib/pushRecordCore.js'), 'utf8')
  ok(/applyLoyaltyClientPushSideEffects/.test(push), '9 push clients вызывает side effects')
  ok(/clientBeforeReady/.test(push), '9d без before не пишем ложный burn')
  const modal = readFileSync(join(root, 'src/components/ClientArchiveReasonModal.jsx'), 'utf8')
  ok(/useLoyaltyArchiveWarn/.test(modal), '9b модалка архива предупреждает')
  const svc = readFileSync(join(root, 'src/lib/admin/clientTrainerReassignService.js'), 'utf8')
  ok(/loyaltyClubMoveWarnText|loyaltyNote/.test(svc), '9c переезд добавляет текст баллов')
  const side = readFileSync(join(root, 'api/_lib/loyaltyClientPushSideEffects.js'), 'utf8')
  ok(/isLoyaltyTableMissing/.test(side), '11 нет таблиц — архив клиента не падает')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nloyalty archive verify ok')
