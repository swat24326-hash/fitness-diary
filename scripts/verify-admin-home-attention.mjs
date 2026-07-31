/**
 * node scripts/verify-admin-home-attention.mjs
 */
import {
  assignAttentionSoftSlots,
  buildAdminHomeSoftSignals,
  pickSoftSignalsForSlots,
} from '../src/lib/admin/adminHomeSoftSignalsCore.js'
import {
  buildAdminDaySummaryCards,
  groupAdminDaySummaryCards,
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
  summary: {
    salesReportFilled: false,
    inactive: 3,
    expiring: 1,
    expired_recent: 2,
    stale: 4,
    birthdays: 1,
  },
  coachQuality: { hot: true, scorePct: 72, chipLabel: 'на разбор' },
})
ok(signals[0]?.id === 'coach-quality', 'soft: coach quality first')
ok(signals[0]?.scorePct === 72, 'soft: coach score')
ok(!signals.some((s) => s.id === 'sales-report'), 'soft: no sales report')
ok(signals.some((s) => s.id === 'inactive'), 'soft: inactive')
ok(signals.some((s) => s.id === 'expired_recent'), 'soft: expired_recent')
ok(signals.some((s) => s.id === 'stale'), 'soft: stale')
ok(signals.some((s) => s.id === 'expiring'), 'soft: expiring')
ok(signals.some((s) => s.id === 'birthdays'), 'soft: birthdays')
ok(
  signals.find((s) => s.id === 'expired_recent')?.href ===
    '/admin/clients?club=club-1&filter=expired_recent',
  'soft expired_recent → clients',
)

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

const emptySides = assignAttentionSoftSlots(signals, { hasPnk: false, hasPlanerka: false })
ok(emptySides.softForPlanerka?.id === 'coach-quality', 'assign: CQ pinned to planerka soft')
ok(emptySides.softForPnk?.id === 'inactive', 'assign: other soft fills pnk')
const withPnk = assignAttentionSoftSlots(signals, { hasPnk: true, hasPlanerka: false })
ok(withPnk.softForPlanerka?.id === 'coach-quality', 'assign: CQ stays on planerka when PNK appears')
ok(withPnk.softForPnk == null, 'assign: no soft in pnk when PNK primary')
const both = assignAttentionSoftSlots(signals, { hasPnk: true, hasPlanerka: true })
ok(both.softForPlanerka == null && both.softForPnk == null, 'assign: no soft when both primary')
ok(
  both.softForPnk?.id !== 'coach-quality' && both.softForPlanerka?.id !== 'coach-quality',
  'assign: CQ never jumps into pnk',
)

const cards = buildAdminDaySummaryCards({
  clubId: 'club-1',
  summary: {
    today: '2026-07-20',
    yesterday: '2026-07-19',
    inactive: 2,
    expiring: 0,
    expired_recent: 1,
    stale: 0,
    birthdays: 0,
    awaiting_start: 3,
    trainingsToday: 5,
    trainingsYesterday: 4,
    salesReportFilled: false,
  },
  coachQuality: { scorePct: 81, hot: false },
})
ok(cards.length === 8, 'day cards funnel + trainings + cq')
ok(
  cards.map((c) => c.key).join(',') ===
    'birthdays,trainings,coachQuality,expiring,expired_recent,stale,inactive,awaiting_start',
  'day cards order: base then path',
)
ok(!cards.some((c) => c.key === 'sales'), 'no sales card')
const inactiveCard = cards.find((c) => c.key === 'inactive')
ok(
  inactiveCard?.to === '/admin/clients?club=club-1&filter=inactive',
  'inactive card → clients',
)
ok(/клиент/i.test(inactiveCard?.hint || ''), 'inactive hint mentions clients')
const awaitingCard = cards.find((c) => c.key === 'awaiting_start')
ok(
  awaitingCard?.to === '/admin/clients?club=club-1&filter=awaiting_start',
  'awaiting_start card → clients',
)
ok(awaitingCard?.count === 3, 'awaiting_start count')
const expiredCard = cards.find((c) => c.key === 'expired_recent')
ok(
  expiredCard?.to === '/admin/clients?club=club-1&filter=expired_recent',
  'expired_recent card → clients',
)
const groups = groupAdminDaySummaryCards(cards)
ok(groups.length === 2, 'two day-summary groups')
ok(groups[0]?.id === 'base' && groups[0].cards.length === 3, 'base: DR + trainings + CQ')
ok(groups[1]?.id === 'path' && groups[1].cards.length === 5, 'path: abo funnel')
ok(groups[0]?.title === 'База и поводы', 'base title')
ok(groups[1]?.title === 'По абонементу', 'path title')
const split = splitDaySummarySpotlight(cards, { maxSpotlight: 2 })
ok(split.spotlight.length === 2, 'spotlight size')
ok(split.spotlight.some((c) => c.key === 'inactive' || c.key === 'expired_recent'), 'spotlight has urgent')
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
