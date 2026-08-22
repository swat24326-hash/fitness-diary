/**
 * node scripts/verify-pnk-manager-board.mjs
 */
import {
  buildPnkManagerControlCards,
  pickPnkBoardSelectedId,
} from '../src/lib/pnk/pnkManagerBoardCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const clients = [
  {
    id: '1',
    name: 'Альфа',
    trainer_id: 't1',
    trainer_name: 'Иван',
    trainer_phone: '+79001111111',
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
    pnk_trial_date: '2026-07-20',
    pnk_created_at: '2026-07-15T10:00:00.000Z',
    pnk_deliverables: { contact: 'x' },
  },
  {
    id: '3',
    name: 'Гамма',
    trainer_id: 't1',
    trainer_name: 'Иван',
    lifecycle: 'pnk',
    pnk_stage: 'trial_done',
    pnk_trial_date: '2026-07-10',
    pnk_created_at: '2026-07-01T10:00:00.000Z',
    pnk_deliverables: { contact: 'x', trial: 'y' },
  },
]

const all = buildPnkManagerControlCards(clients, { now: new Date('2026-07-16T12:00:00') })
ok(all.length === 3 && all[0].isHot, 'hot first among three')
ok(all[0].trainerName === 'Иван' || all.some((c) => c.trainerPhone), 'trainer fields')
ok(pickPnkBoardSelectedId(all) === all[0].id, 'pick defaults to first (hot)')
ok(pickPnkBoardSelectedId(all, { preferredId: '2' }) === '2', 'pick respects preferred')
ok(pickPnkBoardSelectedId([], { preferredId: 'x' }) === '', 'pick empty')

const byTrainer = buildPnkManagerControlCards(clients, { trainerId: 't1' })
ok(byTrainer.length === 2 && byTrainer.every((c) => c.trainerId === 't1'), 'filter trainer')

const byQuery = buildPnkManagerControlCards(clients, { query: 'бета' })
ok(byQuery.length === 1 && byQuery[0].name === 'Бета', 'search name')

const followup = buildPnkManagerControlCards(clients, { boardFilter: 'trial' })
ok(followup.some((c) => c.id === '3'), 'filter after trial')

const midVisit = {
  id: '4',
  name: 'Дельта',
  trainer_id: 't1',
  lifecycle: 'pnk',
  pnk_stage: 'agreed',
  pnk_trial_date: '2026-07-20',
  pnk_deliverables: { contact: 'x', visit_started: 'x', health: 'x', nutrition: 'x' },
}
const withBz = buildPnkManagerControlCards([midVisit], {
  bzCompletedByClient: { 4: 1 },
})
ok(withBz[0]?.stepTitle === 'Домашнее задание', 'board card bz=1 → hw1 step')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-manager-board: all ok')
