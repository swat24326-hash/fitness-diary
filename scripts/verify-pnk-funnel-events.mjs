/**
 * node scripts/verify-pnk-funnel-events.mjs
 */
import {
  buildPnkLostFunnelEvent,
  normalizePnkFunnelEventPushPayload,
} from '../src/lib/pnk/pnkFunnelEventsCore.js'
import { aggregatePnkFunnelStats } from '../src/lib/pnk/pnkStatsAgg.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const openPnk = {
  id: 'c1',
  club_id: 'club1',
  trainer_id: 't1',
  lifecycle: 'pnk',
  pnk_stage: 'trial_done',
  pnk_created_at: '2026-07-10T10:00:00.000Z',
  pnk_deliverables: { nutrition: '2026-07-11', homework: '2026-07-12', trial: '2026-07-11' },
}

const built = buildPnkLostFunnelEvent(openPnk, { reason: 'Дорого', id: 'ev1' })
ok(built.ok, 'build lost event')
ok(built.event.event_type === 'lost', 'type lost')
ok(built.event.had_nutrition && built.event.had_homework && built.event.package_done, 'package flags')
ok(built.event.reason === 'Дорого', 'reason')
ok(!('name' in built.event) && !built.event.phone, 'no PII fields')

const payload = normalizePnkFunnelEventPushPayload(built.event)
ok(payload?.id === 'ev1' && payload.club_id === 'club1', 'push payload')

const activeDk = {
  id: 'c2',
  club_id: 'club1',
  trainer_id: 't1',
  lifecycle: 'active',
  pnk_stage: 'won',
  pnk_created_at: '2026-07-01',
  pnk_won_at: '2026-07-05',
}
ok(!buildPnkLostFunnelEvent(activeDk).ok, 'refuse blocked for active DK')

const openOnly = [
  {
    id: 'open1',
    trainer_id: 't1',
    lifecycle: 'pnk',
    pnk_stage: 'assigned',
    pnk_created_at: '2026-07-03',
    pnk_deliverables: {},
  },
]
const stats = aggregatePnkFunnelStats(openOnly, { dateFrom: '2026-07-01', dateTo: '2026-07-31' }, [
  {
    event_type: 'lost',
    trainer_id: 't1',
    entered_at: '2026-07-08T12:00:00.000Z',
    occurred_at: '2026-07-15T12:00:00.000Z',
    had_nutrition: true,
    had_homework: false,
    trial_done: true,
    package_done: false,
  },
])
ok(stats.entered === 2, `entered with journal ${stats.entered}`)
ok(stats.lost === 1, `lost from journal ${stats.lost}`)
ok(stats.open === 1, `open still ${stats.open}`)
ok(stats.withNutrition === 1, 'nutrition from event')

console.log('\nverify-pnk-funnel-events: all ok')
