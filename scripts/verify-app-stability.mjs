/**
 * Стабильность PWA: кэш идентичности, контекст клуба, политика обновлений.
 * node scripts/verify-app-stability.mjs
 */
import { resolveAdminClubId } from '../src/lib/clubContext.js'
import { decideAppUpdate, isOnTrainingPage, isOnSalesReportPage, shouldAutoApplyUpdate } from '../src/lib/appUpdatePolicy.js'
import {
  isPwaUpdateReloadInCooldown,
  nextPwaUpdateReloadGuard,
  shouldAutoApplyPwaUpdate,
  shouldBlockAutoPwaReload,
  shouldHardRecoverPwaUpdate,
} from '../src/lib/appUpdateReloadGuard.js'
import { planPwaUpdateAction, pwaUpdateBannerCopy } from '../src/lib/appUpdatePlanCore.js'
import { isPwaUpdateInFlightStamp, parsePwaUpdateInFlight } from '../src/lib/appUpdateInFlightCore.js'
import { getAppUpdatePending, setAppUpdatePending, clearAppUpdatePending } from '../src/lib/appUpdateState.js'
import { mergeIdentityCacheIntoUser } from '../src/lib/userIdentityCache.js'
import { parseBundleIdFromHtml, parseBuildTimeFromHtml, formatBuildTimeRu, formatBuildLabel, formatBuildAgeRu, getRemoteBuildProbeUrl } from '../src/lib/appBuildInfo.js'

let failed = 0

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed++
  } else {
    console.log('ok:', msg)
  }
}

ok(
  resolveAdminClubId({
    urlClub: '',
    lastClub: 'club-b',
    validClubIds: ['club-a', 'club-b'],
  }) === 'club-b',
  'admin: last club restored when URL empty',
)

ok(
  resolveAdminClubId({
    urlClub: 'club-a',
    lastClub: 'club-b',
    validClubIds: ['club-a', 'club-b'],
  }) === 'club-a',
  'admin: URL club wins over last',
)

ok(
  resolveAdminClubId({
    urlClub: '',
    lastClub: 'gone',
    validClubIds: ['club-a'],
    singleClubId: 'club-a',
  }) === 'club-a',
  'admin: single club auto-pick',
)

ok(isOnTrainingPage('/trainer/workouts/abc'), 'training path detected')
ok(isOnTrainingPage('/club/workouts/xyz'), 'club training path detected')
ok(!isOnTrainingPage('/sales'), 'sales path is not training')

ok(decideAppUpdate({ pathname: '/login' }) === 'immediate', 'login → immediate update')
ok(decideAppUpdate({ pathname: '/trainer/workouts/x' }) === 'defer', 'training → defer')
ok(
  decideAppUpdate({ pathname: '/trainer', hasTrainingDraft: true }) === 'defer',
  'trainer home + training draft durable → defer',
)
ok(
  decideAppUpdate({ pathname: '/trainer', hasTrainingDraft: false }) === 'immediate',
  'trainer home without draft → immediate',
)
ok(decideAppUpdate({ pathname: '/sales', syncQueueCount: 2, hasTrainingDraft: false }) === 'prompt', 'queue on sales without draft → prompt')
ok(
  decideAppUpdate({ pathname: '/sales', hasSalesDraft: true, hasTrainingDraft: false }) === 'defer',
  'sales report + draft → defer',
)
ok(
  decideAppUpdate({ pathname: '/admin', hasSalesDraft: true, hasTrainingDraft: false }) === 'immediate',
  'admin home + leftover draft → immediate (not defer)',
)
ok(
  decideAppUpdate({ pathname: '/admin', hasSalesDraft: true, hasTrainingDraft: false, syncQueueCount: 1 }) === 'prompt',
  'admin home + draft + queue → prompt',
)
ok(decideAppUpdate({ pathname: '/trainer', hasTrainingDraft: false }) === 'immediate', 'trainer home → immediate')
ok(shouldAutoApplyUpdate('immediate'), 'auto on immediate')
ok(!shouldAutoApplyUpdate('defer'), 'no auto on defer')

{
  const t0 = 1_000_000
  ok(!shouldBlockAutoPwaReload(null, t0), 'no guard → auto reload ok')
  const first = nextPwaUpdateReloadGuard(null, t0)
  ok(first.attempts === 1, 'first attempt counted')
  ok(shouldBlockAutoPwaReload(first, t0 + 1_000), 'within cooldown → block auto')
  ok(!shouldAutoApplyPwaUpdate({ decision: 'immediate', guard: first, now: t0 + 1_000 }), 'auto blocked in cooldown')
  ok(!shouldAutoApplyPwaUpdate({ decision: 'immediate', authLoading: true, guard: null }), 'no auto while auth loading')
  ok(shouldAutoApplyPwaUpdate({ decision: 'immediate', authLoading: false, guard: null }), 'auto when ready')
  ok(shouldHardRecoverPwaUpdate(first, t0 + 1_000), 'second tap in cooldown → hard recover')
  ok(isPwaUpdateReloadInCooldown(first, t0 + 1_000), 'cooldown active')
  ok(!isPwaUpdateReloadInCooldown(first, t0 + 100_000), 'cooldown expired')
  const second = nextPwaUpdateReloadGuard(first, t0 + 2_000)
  ok(second.attempts === 2, 'attempts increment in cooldown')
  ok(planPwaUpdateAction({ decision: 'immediate', authLoading: true }) === 'wait_auth', 'plan: wait auth')
  ok(planPwaUpdateAction({ decision: 'immediate', guard: null }) === 'auto_apply', 'plan: auto')
  ok(planPwaUpdateAction({ decision: 'immediate', guard: first, now: t0 + 1_000 }) === 'manual_only', 'plan: manual after loop')
  ok(planPwaUpdateAction({ decision: 'defer' }) === 'defer', 'plan: defer training')
  ok(planPwaUpdateAction({ decision: 'immediate', manual: true, guard: first, now: t0 + 1_000 }) === 'hard_recover', 'plan: hard recover')
  ok(pwaUpdateBannerCopy({ action: 'manual_only' }).primary === 'Обновить ещё раз', 'copy: retry')
  const inflight = parsePwaUpdateInFlight(JSON.stringify({ at: t0 }))
  ok(isPwaUpdateInFlightStamp(inflight, t0 + 1_000), 'in-flight active')
  ok(!isPwaUpdateInFlightStamp(inflight, t0 + 200_000), 'in-flight expired')
}

ok(isOnSalesReportPage('/admin/sales'), 'admin sales is report page')
ok(isOnSalesReportPage('/sales'), 'manager sales is report page')
ok(!isOnSalesReportPage('/admin'), 'admin home is not sales report')
ok(!isOnSalesReportPage('/sales/pnk'), 'pnk is not sales report')

const merged = mergeIdentityCacheIntoUser(
  { id: 'u1', email: 'a@b.ru', name: 'Ann', club_id: 'c1', role: 'sales_manager', at: 1 },
  { id: 'u1', email: 'a@b.ru', name: '', club_id: null },
)
ok(merged.club_id === 'c1' && merged.name === 'Ann', 'identity cache fills club_id')

const html = '<script type="module" src="/assets/index-deadbeef.js"></script>'
ok(parseBundleIdFromHtml(html) === 'deadbeef', 'parse bundle id from html')

ok(formatBuildTimeRu('2026-07-14T11:30:00.000Z').includes('2026'), 'format build time ru')
ok(formatBuildLabel('abc', '2026-07-14T11:30:00.000Z').startsWith('abc ·'), 'format build label')

const htmlMeta =
  '<meta name="fitness-diary-build-time" content="2026-07-14T12:00:00.000Z" /><script src="/assets/index-deadbeef.js">'
ok(parseBuildTimeFromHtml(htmlMeta) === '2026-07-14T12:00:00.000Z', 'parse build time from html meta')

const ageNow = Date.parse('2026-07-14T12:00:00.000Z')
ok(formatBuildAgeRu('2026-07-14T11:59:30.000Z', ageNow) === 'только что', 'build age: just now')
ok(formatBuildAgeRu('2026-07-14T10:00:00.000Z', ageNow) === '2 ч назад', 'build age: hours')

ok(getRemoteBuildProbeUrl(123).includes('fd_build_probe=123'), 'remote probe url busts cache')

if (typeof localStorage !== 'undefined') {
  clearAppUpdatePending()
  ok(!getAppUpdatePending(), 'update pending starts false')
  setAppUpdatePending(true)
  ok(getAppUpdatePending(), 'update pending set')
  clearAppUpdatePending()
  ok(!getAppUpdatePending(), 'update pending cleared')
}

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll app stability checks passed.')
