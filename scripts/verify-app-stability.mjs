/**
 * Стабильность PWA: кэш идентичности, контекст клуба, политика обновлений.
 * node scripts/verify-app-stability.mjs
 */
import { resolveAdminClubId } from '../src/lib/clubContext.js'
import { decideAppUpdate, isOnTrainingPage, isOnSalesReportPage, shouldAutoApplyUpdate } from '../src/lib/appUpdatePolicy.js'
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
ok(!isOnTrainingPage('/sales'), 'sales path is not training')

ok(decideAppUpdate({ pathname: '/login' }) === 'immediate', 'login → immediate update')
ok(decideAppUpdate({ pathname: '/trainer/workouts/x' }) === 'defer', 'training → defer')
ok(decideAppUpdate({ pathname: '/sales', syncQueueCount: 2 }) === 'prompt', 'queue on sales without draft → prompt')
ok(
  decideAppUpdate({ pathname: '/sales', hasSalesDraft: true }) === 'defer',
  'sales report + draft → defer',
)
ok(
  decideAppUpdate({ pathname: '/admin', hasSalesDraft: true }) === 'immediate',
  'admin home + leftover draft → immediate (not defer)',
)
ok(
  decideAppUpdate({ pathname: '/admin', hasSalesDraft: true, syncQueueCount: 1 }) === 'prompt',
  'admin home + draft + queue → prompt',
)
ok(decideAppUpdate({ pathname: '/trainer' }) === 'immediate', 'trainer home → immediate')
ok(shouldAutoApplyUpdate('immediate'), 'auto on immediate')
ok(!shouldAutoApplyUpdate('defer'), 'no auto on defer')

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
