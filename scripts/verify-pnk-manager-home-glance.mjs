/**
 * node scripts/verify-pnk-manager-home-glance.mjs
 */
import { buildPnkManagerHomeGlance } from '../src/lib/pnk/pnkManagerHomeGlanceCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const now = new Date('2026-07-16T12:00:00')

const empty = buildPnkManagerHomeGlance([], now)
ok(empty.openCount === 0 && !empty.hasWork && !empty.isHot, 'empty club')

const clients = [
  {
    id: '1',
    name: 'Альфа',
    lifecycle: 'pnk',
    pnk_stage: 'assigned',
    pnk_created_at: '2026-06-01T10:00:00.000Z',
    pnk_deliverables: {},
  },
  {
    id: '2',
    name: 'Бета',
    lifecycle: 'pnk',
    pnk_stage: 'trial_done',
    pnk_trial_date: '2026-07-10',
    pnk_created_at: '2026-07-01T10:00:00.000Z',
    pnk_deliverables: { contact: 'x', trial: 'y' },
  },
  {
    id: '3',
    name: 'Вон',
    lifecycle: 'active',
    pnk_stage: 'won',
    pnk_won_at: '2026-07-01',
  },
]

const g = buildPnkManagerHomeGlance(clients, now)
ok(g.openCount === 2 && g.hasWork, 'two open')
ok(g.attentionCount >= 1 && g.isHot, 'attention / hot from overdue trial')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll ok')
