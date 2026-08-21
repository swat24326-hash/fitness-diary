/**
 * node scripts/verify-critical-hall.mjs
 * Сшивка критических сценариев зала: complete, абон, Sync, ПНК, роли, баллы не ломают очередь.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { membershipDebitShouldFollowTrainingSave } from '../src/lib/membershipDebitOrderCore.js'
import { isOpenPnkClient } from '../src/lib/pnk/pnkStagesCore.js'
import { shouldOfferMarkPnkTrialDone } from '../src/lib/pnk/pnkTrialTrainingCore.js'
import { isLoyaltyProgramClient } from '../src/lib/loyalty/loyaltyGlanceUiCore.js'
import { shouldPreserveLocalRowOnPull } from '../src/lib/syncFlushResult.js'
import { resolveHeaderSyncForceFromCloud, resolveHeaderSyncPullRole } from '../src/lib/syncHeaderPullRoleCore.js'
import {
  isTrainingFirstCompletion,
  resolveTrainingPersistStatus,
  shouldSkipDuplicateFirstCompletionSave,
  shouldSkipSilentPersistOfCompleted,
  shouldSkipSilentPersistWhileCompleteInFlight,
} from '../src/lib/trainingPersistStatusCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

ok(isTrainingFirstCompletion('draft', 'completed'), '1 новая → Завершить: первое completed')
ok(!isTrainingFirstCompletion('completed', 'completed'), '1b правка завершённой — не first complete')
ok(resolveTrainingPersistStatus('draft', 'completed') === 'completed', '1c автосейв не откатывает completed')
ok(shouldSkipSilentPersistOfCompleted('completed', true), '1d автосейв пропускает уже completed на диске')
ok(shouldSkipDuplicateFirstCompletionSave('completed', true), '1e второй тап complete не overwrite')
ok(
  shouldSkipSilentPersistWhileCompleteInFlight(true, true),
  '1f автосейв не стартует во время «Закончить»',
)
ok(!shouldSkipSilentPersistWhileCompleteInFlight(false, true), '1g явный save при complete ок')
ok(!shouldSkipSilentPersistWhileCompleteInFlight(true, false), '1h автосейв без complete ок')

{
  const page = read('src/pages/trainer/TrainingPage.jsx')
  const train = page.search(/saveLocalWithSync\(\s*'trainings'/)
  const mem = page.search(/saveLocalWithSync\(\s*'memberships'/)
  const debit = page.search(/await applyMembershipFirstCompletionDebit\(/)
  ok(membershipDebitShouldFollowTrainingSave(), '2 политика: абон после тренировки')
  ok(train >= 0 && (mem > train || debit > train), '2b complete: сначала trainings, потом memberships')
  ok(/shouldSkipDuplicateFirstCompletionSave/.test(page), '2c exclusive: повтор complete по диску')
  ok(/shouldSkipSilentPersistOfCompleted/.test(page), '2d exclusive: автосейв не затирает completed')
  ok(/completeInFlightRef/.test(page), '2e второй тап «Закончить» отсекается')
  ok(/shouldSkipSilentPersistWhileCompleteInFlight/.test(page), '2e2 автосейв пауза на complete')
  ok(/queueOnly:\s*true/.test(page), '2e3 чип очереди без getAll stores')
  const samplesAt = page.indexOf('getSessionSamples')
  const endHrAt = page.indexOf('endTrainingHrSession')
  const exclusiveAt = page.indexOf('await runExclusive')
  ok(samplesAt >= 0 && exclusiveAt > samplesAt && endHrAt > exclusiveAt, '2f пульс: сэмплы до save, гашение после')
}

ok(resolveHeaderSyncPullRole({ isSalesManager: true, isAdmin: true, user: { id: 't' } }) === 'sales', '3 Sync: продажи раньше админа')
ok(resolveHeaderSyncPullRole({ isAdmin: true, user: { id: 'a' } }) === 'admin', '3b Sync: админ')
ok(resolveHeaderSyncPullRole({ user: { id: 't1' } }) === 'trainer', '3c Sync: тренер')
{
  const hook = read('src/components/useHeaderSync.js')
  ok(hook.indexOf('flushSyncQueue') < hook.indexOf('runHeaderSyncPull'), '3d планшет: сначала очередь, потом pull')
  ok(/isAppOnline/.test(hook), '3e без сети Sync не pull')
}
ok(shouldPreserveLocalRowOnPull(new Set(['t-1']), 't-1', { id: 't-1' }), '3f pending не затирается pull')
ok(!PUSH_ALLOWED_TABLES.has('loyalty_ledger'), '3g ledger баллов не в очереди sync')
ok(resolveHeaderSyncForceFromCloud(true), '3h после flush — force справочников')
ok(!resolveHeaderSyncForceFromCloud(false), '3i сбой очереди — не затираем pending типы')
ok(/resolveHeaderSyncForceFromCloud\(flush\?\.ok\)/.test(read('src/components/useHeaderSync.js')), '3j хук: force от flush.ok')

{
  const openPnk = { lifecycle: 'pnk', pnk_stage: 'assigned' }
  ok(isOpenPnkClient(openPnk), '4 открытый ПНК')
  ok(isLoyaltyProgramClient(openPnk) === false, '4b ПНК: без штампа/вкладки баллов')
  ok(isLoyaltyProgramClient({ lifecycle: 'active', desk_hall: 'tz' }) === false, '4c ТЗ без баллов')
  ok(isLoyaltyProgramClient({ lifecycle: 'active', desk_hall: null }) === true, '4d ПЗ в программе')
  ok(
    shouldOfferMarkPnkTrialDone({ lifecycle: 'pnk', pnk_stage: 'assigned' }, 1) === true,
    '4e complete ПНК: шаг пробной',
  )
}

{
  const stats = read('src/pages/trainer/Statistics.jsx')
  const cq = read('src/lib/admin/coachQualityService.js')
  ok(!/loyalty/i.test(stats), '5 статистика карточки без баллов')
  ok(!/loyalty/i.test(cq), '5b качество ведения без баллов')
  ok(/pullExercisesFromCloud/.test(read('src/lib/syncHeaderPullService.js')), '5c админ/тренер тянут справочник')
  ok(!/pullExercises/.test(read('src/lib/syncHeaderPullSales.js')), '5d продажи без справочника упражнений')
}

{
  const agg = read('src/lib/admin/clubClientPeriodAgg.js')
  const typeAgg = read('src/lib/admin/membershipTypeStatsAgg.js')
  const glance = read('src/lib/homeGlanceCache.js')
  const retention = read('src/lib/idbRetention.js')
  const iskraAvail = read('src/lib/admin/iskraDataAvailability.js')
  ok(!/loyalty/i.test(agg) && !/loyalty/i.test(typeAgg), '6 статистика клуба / agg без баллов')
  ok(!/loyalty/i.test(glance), '6b home glance без баллов (отдельный кэш)')
  ok(!/loyalty_glance/.test(retention), '6c retention не чистит last-good баллов')
  ok(!/loyalty/i.test(iskraAvail), '6d ИСКРА availability без баллов')
  ok(/Лояльность/.test(read('src/lib/breadcrumbsCore.js')), '6e крошки журнала баллов')
  ok(/forceFromCloud === true \? \{ forceFromCloud: true \}/.test(read('src/lib/syncHeaderPullAdmin.js')), '6f админ force типов после flush')
  ok(/forceFromCloud === true \? \{ forceFromCloud: true \}/.test(read('src/lib/syncHeaderPullTrainer.js')), '6g тренер force типов после flush')
}

{
  const page = read('src/pages/trainer/TrainingPage.jsx')
  const followUp = read('src/lib/trainer/trainingCompleteFollowUp.js')
  const reconcile = read('src/lib/membership/membershipUsedReconcileCore.js')
  const mm = read('src/components/MembershipManager.jsx')
  ok(/runTrainingCompleteFollowUp\(cid\)/.test(page), '7a complete: follow-up без await')
  ok(!/await\s+runTrainingCompleteFollowUp/.test(page), '7b complete: follow-up не блокирует UI')
  ok(!/await\s+flushSyncQueue/.test(page), '7c finish: нет await flush в TrainingPage')
  ok(/scheduleBackgroundSyncDrain/.test(followUp), '7d follow-up: фоновый drain')
  ok(/planMembershipUsedReconcile/.test(reconcile), '7e reconcile в lib')
  ok(/planMembershipUsedReconcile/.test(mm), '7f MembershipManager использует общий reconcile')
  ok(/training-completed/.test(mm) && /membership-used-reconciled/.test(mm), '7g абон перезагружается после complete')
  ok(/useSyncOutboundPoll/.test(page), '7h чип очереди на экране тренировки')
}

{
  const page = read('src/pages/trainer/TrainingPage.jsx')
  const card = read('src/pages/trainer/ClientCard.jsx')
  const prefetch = read('src/lib/trainer/trainingClientPrefetch.js')
  const debit = read('src/lib/trainer/trainingMembershipDebitCore.js')
  ok(/prefetchTrainerClientWorkspace/.test(prefetch), '8a prefetch модуль')
  ok(/ensureClientTrainingsCached/.test(prefetch), '8b prefetch: дневник TTL')
  ok(/refreshMembershipsForStats/.test(prefetch), '8c prefetch: абоны')
  ok(/prefetchTrainerClientWorkspace/.test(page), '8d TrainingPage prefetch при load')
  ok(/prefetchTrainerClientWorkspace/.test(card), '8e ClientCard prefetch')
  ok(/resolveMembershipForFirstCompletionDebit/.test(page), '8f debit через сервис')
  ok(/await applyMembershipFirstCompletionDebit\(/.test(page), '8g apply debit через сервис')
  ok(/planMembershipFirstCompletionDebit/.test(debit), '8h debit plan в lib')
}

{
  const pruneCore = read('src/lib/trainerPullClientPruneCore.js')
  const pull = read('src/lib/trainerPullService.js')
  const clientsPage = read('src/pages/trainer/TrainerClients.jsx')
  ok(/planTrainerOrphanClientPrune/.test(pruneCore), '9a archive prune core')
  ok(/mode === 'archive' && !archived/.test(pruneCore), '9b archive mode preserves live')
  ok(/planTrainerOrphanClientPrune/.test(pull), '9c trainerPull uses prune core')
  ok(/trainerPullChain|enqueueTrainerPull/.test(pull), '9d trainer pulls serialized')
  ok(/mode:\s*'archive'/.test(clientsPage), '9e Clients: archive pull')
  ok(/archivedClients\.length === 0/.test(clientsPage), '9f Clients: recover Active 0 + Archive N')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\ncritical hall verify ok')
