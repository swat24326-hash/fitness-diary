/**
 * node scripts/verify-loyalty-integration.mjs
 * Стыки с complete, Sync, архивом, карточкой, pull: лояльность не подвешивает зал.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUSH_ALLOWED_TABLES } from '../api/_lib/pushRecordCore.js'
import { PULL_MERGE_GUARD_STORE_LIST } from '../src/lib/syncPullGuardCore.js'
import { isOpenPnkClient, isPnkCardTabVisible } from '../src/lib/pnk/pnkStagesCore.js'
import { isLoyaltyProgramClient, shouldShowLoyaltyUi } from '../src/lib/loyalty/loyaltyGlanceUiCore.js'
import {
  LOYALTY_COMPLETE_SETTINGS_TIMEOUT_MS,
  LOYALTY_FETCH_TIMEOUT_MS,
  LOYALTY_PUSH_SNAPSHOT_TIMEOUT_MS,
  LOYALTY_WARN_TIMEOUT_MS,
  raceWithTimeout,
} from '../src/lib/loyalty/loyaltyTimeoutCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

function tabOk(client, tabId, ctx) {
  if (tabId === 'loyalty' && !shouldShowLoyaltyUi(client)) return false
  return !isOpenPnkClient(client) || isPnkCardTabVisible(client, tabId, ctx)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

ok(LOYALTY_COMPLETE_SETTINGS_TIMEOUT_MS === 4_000, '1 complete settings ≤4 с, не 45 с club-stats')
ok(LOYALTY_FETCH_TIMEOUT_MS === 8_000, '1b карточка/glance ≤8 с')
ok(LOYALTY_PUSH_SNAPSHOT_TIMEOUT_MS === 3_000, '1c снимок архива в push ≤3 с')
ok(LOYALTY_WARN_TIMEOUT_MS === 2_000, '1e архив/переезд без кэша ≤2 с')

{
  const api = read('src/lib/loyalty/loyaltyApiClient.js')
  ok(!/CLUB_STATS_FETCH_TIMEOUT/.test(api), '1d loyalty HTTP без таймаута club-stats')
}

{
  const started = Date.now()
  try {
    await raceWithTimeout(new Promise(() => {}), 40, 'loyalty snapshot timeout')
    ok(false, '2 таймаут должен отклонить')
  } catch (e) {
    ok(e?.message === 'loyalty snapshot timeout', '2 label таймаута снимка')
    ok(Date.now() - started < 250, '2b таймаут не зависает')
  }
  const value = await raceWithTimeout(Promise.resolve(7), 200, 'loyalty snapshot timeout')
  ok(value === 7, '2c быстрый ответ не режется')
}

{
  const persist = read('src/pages/trainer/TrainingPage.jsx')
  ok(/isLoyaltyProgramClient\(client\)/.test(persist), '3 ТЗ/АЗ/открытый ПНК — без GET и штампа')
  ok(/stampLoyalty = firstCompletion && isLoyaltyProgramClient/.test(persist), '3b штамп complete только у программы')
  ok(
    /if \(!isLoyaltyProgramClient\(client\)\) return/.test(persist),
    '3e черновик ТЗ/ПНК без session_started_at',
  )
  const train = persist.search(/saveLocalWithSync\(\s*'trainings'/)
  const mem = persist.search(/saveLocalWithSync\(\s*'memberships'/)
  ok(train >= 0 && mem > train, '3c абонемент списывается после записи тренировки')
  const completeSvc = read('src/lib/loyalty/loyaltyCompleteSettingsService.js')
  ok(/LOYALTY_COMPLETE_SETTINGS_TIMEOUT_MS/.test(completeSvc), '3d complete GET с коротким таймаутом')
  ok(/loyaltySettingsPromise/.test(persist), '3f ставки клуба грузятся параллельно с абонементом')
  ok(/preferCache:\s*true/.test(read('src/lib/loyalty/loyaltyWarnService.js')), '3g переезд/архив: last-good не ждёт 8 с')
  ok(/LOYALTY_WARN_TIMEOUT_MS/.test(read('src/lib/loyalty/loyaltyWarnService.js')), '3h warn GET короткий')
  ok(/loadLoyaltyWarnSnapshot/.test(read('src/lib/admin/clientTrainerReassignService.js')), '3i confirm переезда берёт warn snapshot')
  ok(/shouldSkipDuplicateFirstCompletionSave/.test(persist), '3j второй тап complete не затирает штамп')
  ok(/shouldSkipSilentPersistOfCompleted/.test(persist), '3k автосейв не откатывает completed')
  ok(/completeInFlightRef/.test(persist), '3l второй тап «Закончить» не стартует второй complete')
  const samplesAt = persist.indexOf('getSessionSamples')
  const endHrAt = persist.indexOf('endTrainingHrSession')
  const exclusiveAt = persist.indexOf('await runExclusive')
  ok(samplesAt >= 0 && exclusiveAt > samplesAt, '3m сэмплы HR до exclusive save')
  ok(endHrAt > exclusiveAt, '3n гашение пульса после записи completed')
}

{
  const pz = { id: 'c-pz', lifecycle: 'active', desk_hall: null }
  const tz = { id: 'c-tz', lifecycle: 'active', desk_hall: 'tz' }
  const az = { id: 'c-az', lifecycle: 'active', desk_hall: 'az' }
  const litePz = { id: 'c-lite', lifecycle: 'active', desk_hall: null, trainer_id: 't-notab' }
  const openPnk = {
    id: 'c-pnk',
    lifecycle: 'pnk',
    pnk_stage: 'assigned',
    pnk_deliverables: { contact: 'x' },
    desk_hall: null,
  }
  ok(tabOk(pz, 'loyalty') === true, '4 ПЗ — вкладка Баллы')
  ok(tabOk(litePz, 'loyalty') === true, '4b lite ПЗ — вкладка Баллы')
  ok(tabOk(tz, 'loyalty') === false, '4c ТЗ — нет вкладки Баллы')
  ok(tabOk(az, 'loyalty') === false, '4d АЗ — нет вкладки Баллы')
  ok(tabOk(openPnk, 'loyalty') === false, '4e открытый ПНК — нет вкладки Баллы')
  ok(isLoyaltyProgramClient(tz) === false && isLoyaltyProgramClient(pz) === true, '4g программа: ПЗ да, ТЗ нет')
  const tabs = read('src/pages/trainer/ClientCardMainTabs.jsx')
  ok(/shouldShowLoyaltyUi\(client\)/.test(tabs), '4f карточка фильтрует Баллы через shouldShowLoyaltyUi')
}

{
  const pull = read('api/trainer-pull.js')
  const getClient = read('api/get-client.js')
  ok(!/loyalty/i.test(pull), '5 trainer-pull без loyalty')
  ok(!/loyalty/i.test(getClient), '5b get-client без loyalty')
  ok(!PUSH_ALLOWED_TABLES.has('loyalty_ledger'), '5c ledger не в push')
  ok(!PUSH_ALLOWED_TABLES.has('club_loyalty_settings'), '5d settings не в push')
  ok(!PULL_MERGE_GUARD_STORE_LIST.includes('loyalty_glance'), '5e glance не в pull-guard')
}

{
  const header = read('src/components/useHeaderSync.js')
  const trainerPull = read('src/lib/syncHeaderPullTrainer.js')
  ok(/runHeaderSyncPull/.test(header), '6 хук вызывает pull после flush')
  ok(header.indexOf('flushSyncQueue') < header.indexOf('runHeaderSyncPull'), '6f сначала очередь, потом pull')
  ok(/refreshLoyaltyGlanceAfterTrainerPull/.test(trainerPull), '6 после успешного trainer-pull — glance')
  ok(/void import\('\.\/loyalty\/loyaltyGlanceService\.js'\)/.test(trainerPull), '6b glance не await — Sync не ждёт баллы')
  ok(!/await refreshLoyaltyGlanceAfterTrainerPull/.test(trainerPull), '6d нет блокирующего await glance')
  ok(!/parts\.push\(`баллы:/.test(header + trainerPull), '6c ошибка glance не в статусе Sync')
  ok(!/bumpSyncProgress\(88, 'Баллы/.test(header + trainerPull), '6e Sync не стоит на шаге Баллы')
}

{
  const side = read('api/_lib/loyaltyClientPushSideEffects.js')
  ok(/raceWithTimeout/.test(side), '7 архив: снимок с таймаутом')
  ok(/LOYALTY_PUSH_SNAPSHOT_TIMEOUT_MS/.test(side), '7b константа 3 с')
  const push = read('api/_lib/pushRecordCore.js')
  ok(/applyLoyaltyClientPushSideEffects/.test(push), '7c side effects после clients')
  ok(/catch \(e\) \{\s*if \(isLoyaltyTableMissing/.test(side.replace(/\r\n/g, '\n')), '7d ошибка лояльности не валит архив')
  const snapCatch = side.replace(/\r\n/g, '\n').split('loyalty snapshot timeout')[1]?.split('insertLoyaltyLedgerRow')[0] ?? ''
  ok(snapCatch.includes('archive snapshot') && !/\breturn\b/.test(snapCatch), '7e сбой снимка не отменяет club_move')
}

{
  const stats = read('src/pages/trainer/Statistics.jsx')
  ok(!/loyalty/i.test(stats), '8 статистика карточки без лояльности')
  const cq = read('src/lib/admin/coachQualityService.js')
  ok(!/loyalty/i.test(cq), '8b качество ведения без лояльности')
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nloyalty integration verify ok')
