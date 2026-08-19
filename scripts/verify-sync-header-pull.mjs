/**
 * node scripts/verify-sync-header-pull.mjs
 * Ручной Sync: flush в хуке, pull по ролям в lib. Glance не держит Sync.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveHeaderSyncForceFromCloud, resolveHeaderSyncPullRole } from '../src/lib/syncHeaderPullRoleCore.js'

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

ok(resolveHeaderSyncPullRole({ isSalesManager: true, isAdmin: true, user: { id: 't' } }) === 'sales', '0 управляющий/менеджер — ветка продаж')
ok(resolveHeaderSyncPullRole({ isAdmin: true, user: { id: 'a' } }) === 'admin', '0b админ')
ok(resolveHeaderSyncPullRole({ user: { id: 't1' } }) === 'trainer', '0c тренер')
ok(resolveHeaderSyncPullRole({}) === 'none', '0d без роли — нет pull')
ok(/isSalesManager: isSalesManager \|\| isSupervisor/.test(read('src/components/AppHeader.jsx')), '0e шапка: управляющий как менеджер на Sync')
ok(resolveHeaderSyncForceFromCloud(true) === true, '0f force справочников только после успешного flush')
ok(resolveHeaderSyncForceFromCloud(false) === false, '0g сбой очереди — не force-merge типов')
ok(/resolveHeaderSyncForceFromCloud\(flush\?\.ok\)/.test(read('src/components/useHeaderSync.js')), '0h хук передаёт force от flush.ok')

const hook = read('src/components/useHeaderSync.js')
const orch = read('src/lib/syncHeaderPullService.js')
const sales = read('src/lib/syncHeaderPullSales.js')
const admin = read('src/lib/syncHeaderPullAdmin.js')
const trainer = read('src/lib/syncHeaderPullTrainer.js')

ok(/flushSyncQueue/.test(hook), '1 хук шлёт очередь')
ok(/runHeaderSyncPull/.test(hook), '1b хук вызывает pull-сервис')
ok(hook.indexOf('flushSyncQueue') < hook.indexOf('runHeaderSyncPull'), '1c flush раньше pull')
ok(!/pullTrainerWorkspaceFromCloud/.test(hook), '1d trainer-pull не в хуке')
ok(!/pullAdminClientsFromCloud/.test(hook), '1e admin clients не в хуке')
ok(/pruneRedundantSyncQueue/.test(hook), '1f после pull — чистка очереди')

ok(/resolveHeaderSyncPullRole/.test(orch), '2 роль из core')
ok(orch.indexOf("role === 'sales'") < orch.indexOf('pullExercisesFromCloud'), '2b продажи без справочника упражнений')
ok(!/pullExercises/.test(sales), '2c sales-файл без exercises')
ok(/if \(ex\?\.ok\)/.test(orch), '2d сбой справочника — не «готово»')

ok(/pullAdminClientsFromCloud/.test(admin), '3 админ тянет клиентов клуба')
ok(/клиенты: выберите клуб/.test(admin), '3b без клуба в URL — подсказка')
ok(/return true/.test(admin.split('if (!club)')[1]?.slice(0, 180) ?? ''), '3d без клуба — hadError, не «готово»')
ok(/recordSyncPullIssue\('клиенты клуба'/.test(admin), '3c сбой клиентов — hadError, не «готово»')
ok(/recordSyncPullIssue\('челленджи'/.test(admin), '3e сбой челленджей — в журнал pull')

ok(/pullTrainerWorkspaceFromCloud/.test(trainer), '4 тренер — рабочая область')
ok(/fetchWithAppTimeout/.test(read('src/lib/syncApiClient.js')), '4a trainer-pull через fetchWithAppTimeout')
ok(/SYNC_PULL_FETCH_TIMEOUT_MS/.test(read('src/lib/networkReachability.js')), '4b константа таймаута pull')
ok(/void import\('\.\/loyalty\/loyaltyGlanceService\.js'\)/.test(trainer), '4b glance фоном')
ok(!/await refreshLoyaltyGlanceAfterTrainerPull/.test(trainer), '4c glance не блокирует')
{
  const okBranch = trainer.split('if (pull?.ok)')[1]?.split('} else {')[0] ?? ''
  ok(/void import/.test(okBranch) && !/hadError/.test(okBranch), '4d успех pull без hadError на glance')
}
ok(/тренер: \$\{pull\?\.error/.test(trainer), '4e сбой рабочей области — замечание Sync')
ok(/recordSyncPullIssue\('рабочая область'/.test(trainer), '4f сбой рабочей области — в журнал pull')
ok(/recordSyncPullIssue\('челленджи'/.test(trainer), '4g сбой челленджей тренера — в журнал pull')

ok(/нет клуба у профиля/.test(sales), '5 менеджер без club_id — не «готово»')
ok(/recordSyncPullIssue\('клиенты клуба', 'нет клуба у профиля'/.test(sales), '5b нет клуба — в журнал pull')
ok(/forceFromCloud === true \? \{ forceFromCloud: true \}/.test(sales), '5c продажи: force типов только если flush ок')
ok(/forceFromCloud === true \? \{ forceFromCloud: true \}/.test(admin), '5d админ: force типов/питания/ДЗ после flush')
ok(/forceFromCloud === true \? \{ forceFromCloud: true \}/.test(trainer), '5e тренер: force справочников после flush')
ok(/pullMembershipTypesForClubFromCloud\(club, refOpts\)/.test(admin), '5f админ передаёт refOpts в типы')
ok(/pullMembershipTypesForClubFromCloud\(cid, refOpts\)/.test(trainer), '5g тренер передаёт refOpts в типы')

ok(!/sessionRecovering \|\|/.test(read('src/App.jsx')), '6 splash не блокирует UI только из‑за sessionRecovering')
ok(/MANUAL_SYNC_GUARD_MS/.test(hook), '6b потолок времени ручного Sync')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nsync header pull verify ok')
