/**
 * node scripts/verify-pnk-manager-home-glance.mjs
 */
import {
  buildPnkManagerHomeGlance,
  buildPnkManagerHomeGlanceCards,
} from '../src/lib/pnk/pnkManagerHomeGlanceCore.js'

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
    trainer_id: 't1',
    trainer_name: 'Иван',
    lifecycle: 'pnk',
    pnk_stage: 'assigned',
    pnk_created_at: '2026-06-01T10:00:00.000Z',
    pnk_deliverables: {},
  },
  {
    id: '2',
    name: 'Бета',
    trainer_id: 't2',
    trainer_name: 'Пётр',
    lifecycle: 'pnk',
    pnk_stage: 'agreed',
    pnk_trial_date: '2026-07-10',
    pnk_created_at: '2026-07-01T10:00:00.000Z',
    pnk_deliverables: { contact: 'x' },
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

const cards = buildPnkManagerHomeGlanceCards(clients, {
  boardHref: '/sales/pnk',
  now,
})
ok(cards.length === 2, 'two carousel cards')
ok(cards.every((c) => c.isHot || c.name === 'Альфа' || c.name === 'Бета'), 'open names only')
const beta = cards.find((c) => c.id === '2')
ok(beta?.isHot && beta.href.includes('focus=2'), 'beta hot + focus query')
ok(String(cards[0].fromLine).includes('Тренер:'), 'trainer in from line')
ok(cards.every((c) => c.stepN >= 1 && c.stepTotal === 10), 'step fields')
ok(cards[0].isHot, 'hot sorted first when present')

const adminCards = buildPnkManagerHomeGlanceCards(clients, {
  boardHref: '/admin/pnk?club=c1',
  now,
})
ok(adminCards[0].href.includes('club=c1') && adminCards[0].href.includes('focus='), 'admin href keeps club')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll ok')
