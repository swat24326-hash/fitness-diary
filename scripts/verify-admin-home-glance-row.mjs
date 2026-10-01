/**
 * node scripts/verify-admin-home-glance-row.mjs
 */
import {
  ADMIN_HOME_GLANCE_EMPTY,
  buildCoachQualityHomeSlot,
  resolveHomeGlanceSlotState,
} from '../src/lib/admin/adminHomeGlanceRowCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(resolveHomeGlanceSlotState({ hasData: true, loading: true }) === 'data', 'data wins over loading')
ok(resolveHomeGlanceSlotState({ hasData: false, loading: true }) === 'skeleton', 'loading without data → skeleton')
ok(resolveHomeGlanceSlotState({}) === 'empty', 'no data, not loading → empty (card stays)')

const statsPath = '/admin/statistics'
const cqHref = '/admin/statistics?club=club-1&period=month&panel=coachQuality'

const withScore = buildCoachQualityHomeSlot({
  coachQuality: { scorePct: 81, hot: false },
  clubId: 'club-1',
  statsPath,
})
ok(withScore.state === 'data' && withScore.signal?.scorePct === 81, 'cq: score → data')
ok(withScore.href === cqHref, 'cq: href to statistics panel')

const loadingCq = buildCoachQualityHomeSlot({ coachQuality: null, loading: true, clubId: 'club-1', statsPath })
ok(loadingCq.state === 'skeleton', 'cq: loading → skeleton')

const emptyCq = buildCoachQualityHomeSlot({ coachQuality: null, loading: false, clubId: 'club-1', statsPath })
ok(emptyCq.state === 'empty' && emptyCq.signal == null, 'cq: no data → empty card')
ok(emptyCq.href === cqHref, 'cq empty: still leads to statistics')

const blankCq = buildCoachQualityHomeSlot({
  coachQuality: { scorePct: null, hot: false },
  clubId: 'club-1',
  statsPath,
})
ok(blankCq.state === 'empty', 'cq: glance without score/hot/chip → empty')

const supervisor = buildCoachQualityHomeSlot({ coachQuality: null, clubId: 'club-9', statsPath: '/club/statistics' })
ok(supervisor.href.startsWith('/club/statistics'), 'cq: supervisor path kept')

for (const key of ['pnk', 'coachQuality', 'planerka']) {
  const e = ADMIN_HOME_GLANCE_EMPTY[key]
  ok(Boolean(e?.title && e?.text && e?.cta), `empty copy: ${key}`)
}

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-admin-home-glance-row: all ok')
