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

{
  const page = read('src/pages/trainer/TrainingPage.jsx')
  const train = page.search(/saveLocalWithSync\(\s*'trainings'/)
  const mem = page.search(/saveLocalWithSync\(\s*'memberships'/)
  ok(membershipDebitShouldFollowTrainingSave(), '2 политика: абон после тренировки')
  ok(train >= 0 && mem > train, '2b complete: сначала trainings, потом memberships')
  ok(/shouldSkipDuplicateFirstCompletionSave/.test(page), '2c exclusive: повтор complete по диску')
  ok(/shouldSkipSilentPersistOfCompleted/.test(page), '2d exclusive: автосейв не затирает completed')
  ok(/completeInFlightRef/.test(page), '2e второй тап «Закончить» отсекается')
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

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\ncritical hall verify ok')
