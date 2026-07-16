/**
 * node scripts/verify-pnk-trainer-glance.mjs
 */
import {
  buildPnkGlanceCard,
  buildPnkGlanceCards,
  buildPnkStepSegments,
} from '../src/lib/pnk/pnkTrainerGlanceCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const open = {
  id: 'c1',
  name: 'Иванов',
  lifecycle: 'pnk',
  pnk_stage: 'assigned',
  pnk_created_at: '2026-07-01T10:00:00.000Z',
  pnk_deliverables: {},
}

const card = buildPnkGlanceCard(open, new Date('2026-07-16T12:00:00'))
ok(card && card.stepN === 1 && card.href.includes('c1'), 'glance created step')
ok(card.isHot === true, 'stale contact is hot')

const withDate = {
  ...open,
  pnk_stage: 'agreed',
  pnk_trial_date: '2026-07-20',
  pnk_trial_time: '10:00',
  pnk_deliverables: { contact: '2026-07-15' },
}
const visit = buildPnkGlanceCard(withDate)
ok(visit?.stepN === 3 && visit.caption.includes('20'), 'visit caption has date')

const list = buildPnkGlanceCards([
  withDate,
  { ...open, id: 'c2', name: 'Петров', pnk_created_at: '2026-07-16T10:00:00.000Z' },
  { id: 'x', lifecycle: 'active', name: 'Не ПНК' },
])
ok(list.length === 2 && list[0].isHot, 'sort hot first, skip active')

const segs = buildPnkStepSegments({ stepN: 4, stepTotal: 5 })
ok(segs.segments.length === 5, 'five blocks')
ok(segs.segments.filter((s) => s.state === 'done').length === 3, '3 done before current')
ok(segs.segments[3].state === 'current', '4th is current')
ok(segs.segments[4].state === 'todo', '5th todo')

ok(buildPnkGlanceCard({ lifecycle: 'pnk', pnk_stage: 'won' }) == null, 'won not in glance')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-trainer-glance: all ok')
