/**
 * node scripts/verify-admin-home-attention.mjs
 */
import {
  buildAdminHomeSoftSignals,
  pickSoftSignalsForSlots,
} from '../src/lib/admin/adminHomeSoftSignalsCore.js'
import {
  buildAdminDaySummaryCards,
  splitDaySummarySpotlight,
} from '../src/lib/admin/adminDaySummaryUiCore.js'
import {
  buildCoachQualityHomeGlanceVm,
  resolveCoachQualityHomeBand,
  resolveCoachQualityScoreBand,
} from '../src/lib/admin/coachQualityHomeGlanceCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const signals = buildAdminHomeSoftSignals({
  clubId: 'club-1',
  summary: { salesReportFilled: false, inactive: 3, expiring: 1 },
  coachQuality: { hot: true, scorePct: 72, chipLabel: 'на разбор' },
})
ok(signals[0]?.id === 'coach-quality', 'soft: coach quality first')
ok(signals[0]?.scorePct === 72, 'soft: coach score')
ok(!signals.some((s) => s.id === 'sales-report'), 'soft: no sales report')
ok(signals.some((s) => s.id === 'inactive'), 'soft: inactive')
ok(signals.some((s) => s.id === 'expiring'), 'soft: expiring')

const calmCq = buildAdminHomeSoftSignals({
  clubId: 'club-1',
  coachQuality: { hot: false, scorePct: 81 },
})
ok(calmCq[0]?.id === 'coach-quality' && calmCq[0]?.scorePct === 81, 'soft: coach even when not hot')
ok(calmCq[0]?.chipLabel == null, 'soft: calm has no chipLabel')
ok(calmCq[0]?.reviewCount === 0, 'soft: calm review 0')

ok(resolveCoachQualityScoreBand(85) === 'ok', 'scale: 85 ok')
ok(resolveCoachQualityScoreBand(81) === 'attention', 'scale: 81 between markers')
ok(resolveCoachQualityScoreBand(60) === 'review', 'scale: 60 review')
ok(resolveCoachQualityHomeBand({ scorePct: 81 }) === 'ok', 'badge: calm 81 is Ok')
ok(resolveCoachQualityHomeBand({ scorePct: 72, reviewCount: 1 }) === 'review', 'badge: review fact')

const calmVm = buildCoachQualityHomeGlanceVm({ scorePct: 81 })
ok(calmVm.fillPct === 81 && calmVm.markers.length === 2, 'vm: scale + markers')
ok(calmVm.band === 'ok', 'vm: calm badge Ok')
ok(calmVm.calm && /спокойно/i.test(calmVm.headline || ''), 'vm: calm headline')

const hotVm = buildCoachQualityHomeGlanceVm({
  scorePct: 72,
  reviewCount: 1,
  attentionCount: 2,
  droppedCount: 1,
  chipLabel: '1 на разбор · 1 просели',
})
ok(hotVm.facts.length === 3, 'vm: three facts')
ok(hotVm.band === 'review', 'vm: hot band from review fact')
ok(hotVm.headline === '1 на разбор · 1 просели', 'vm: chip as headline')

ok(pickSoftSignalsForSlots(signals, { primarySides: 0 }).length === 2, 'pick 2 when empty sides')
ok(pickSoftSignalsForSlots(signals, { primarySides: 1 }).length === 1, 'pick 1 when one primary')
ok(pickSoftSignalsForSlots(signals, { primarySides: 2 }).length === 0, 'pick 0 when full')

const cards = buildAdminDaySummaryCards({
  clubId: 'club-1',
  summary: {
    today: '2026-07-20',
    yesterday: '2026-07-19',
    inactive: 2,
    expiring: 0,
    trainingsToday: 5,
    trainingsYesterday: 4,
    salesReportFilled: false,
  },
  coachQuality: { scorePct: 81, hot: false },
})
ok(cards.length === 4, 'day cards without sales')
ok(!cards.some((c) => c.key === 'sales'), 'no sales card')
const inactiveCard = cards.find((c) => c.key === 'inactive')
ok(
  inactiveCard?.to === '/admin/clients?club=club-1&filter=inactive',
  'inactive card → clients',
)
ok(/клиент/i.test(inactiveCard?.hint || ''), 'inactive hint mentions clients')
const split = splitDaySummarySpotlight(cards, { maxSpotlight: 2 })
ok(split.spotlight.length === 2, 'spotlight size')
ok(split.spotlight.some((c) => c.key === 'inactive'), 'spotlight has inactive')
ok(split.hasMore === true, 'has more')

const softInactive = signals.find((s) => s.id === 'inactive')
ok(
  softInactive?.href === '/admin/clients?club=club-1&filter=inactive',
  'soft inactive → clients',
)
if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
