/**
 * node scripts/verify-training-chronology.mjs
 * Номер «N/M»: черновик раньше списаний неявок не должен забирать «1».
 */
import {
  compareTrainingsChronological,
  stampTrainingCompletedAt,
  trainingChronologyInstant,
} from '../src/lib/membership/trainingChronologyCore.js'
import { completedWorkoutNumberOnMembership } from '../src/lib/membershipRules.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed += 1
  }
}

const mem = { id: 'm1', start_date: '2026-10-01', end_date: '2026-11-09', total_trainings: 8 }

// Как у Артёма: открыл черновик → 5 списаний → Закончить.
const draftOpened = '2026-10-28T10:00:00.000Z'
const writeoffs = [1, 2, 3, 4, 5].map((n) => ({
  id: `w${n}`,
  status: 'completed',
  date: '2026-10-28',
  created_at: `2026-10-28T10:0${n}:00.000Z`,
  data: {
    membership_id: 'm1',
    is_writeoff: true,
    training_focus: 'Списание (неявка)',
    completed_at: `2026-10-28T10:0${n}:00.000Z`,
  },
}))
const real = {
  id: 'real',
  status: 'completed',
  date: '2026-10-28',
  created_at: draftOpened,
  data: {
    membership_id: 'm1',
    training_focus: 'Общая',
    completed_at: '2026-10-28T11:00:00.000Z',
    loyalty: { completed_at: '2026-10-28T11:00:00.000Z' },
  },
}
const all = [...writeoffs, real]

ok(trainingChronologyInstant(real) === '2026-10-28T11:00:00.000Z', 'проведённая — по completed_at, не created_at черновика')
ok(trainingChronologyInstant(writeoffs[0]).startsWith('2026-10-28T10:01'), 'списание — completed_at')

const sorted = [...all].sort(compareTrainingsChronological)
ok(sorted[0].id === 'w1' && sorted[5].id === 'real', 'хронология: списания, потом проведённая')

ok(completedWorkoutNumberOnMembership(real, mem, all) === 6, 'проведённая = 6/8 после пяти списаний')
ok(completedWorkoutNumberOnMembership(writeoffs[0], mem, all) === 1, 'первое списание = 1/8')

// Старые данные без data.completed_at: берём loyalty.completed_at
const legacyReal = {
  id: 'legacy',
  status: 'completed',
  date: '2026-10-28',
  created_at: draftOpened,
  data: { membership_id: 'm1', loyalty: { completed_at: '2026-10-28T12:00:00.000Z' } },
}
const legacyWrite = {
  id: 'lw',
  status: 'completed',
  date: '2026-10-28',
  created_at: '2026-10-28T10:30:00.000Z',
  data: { membership_id: 'm1', is_writeoff: true },
}
ok(completedWorkoutNumberOnMembership(legacyWrite, mem, [legacyWrite, legacyReal]) === 1, 'legacy: списание раньше по created_at')
ok(completedWorkoutNumberOnMembership(legacyReal, mem, [legacyWrite, legacyReal]) === 2, 'legacy: loyalty.completed_at позже → 2')

// Без штампов — как раньше: только created_at (списание/лимит не трогаем).
const oldA = {
  id: 'oa',
  status: 'completed',
  date: '2026-10-28',
  created_at: '2026-10-28T09:00:00.000Z',
  data: { membership_id: 'm1' },
}
const oldB = {
  id: 'ob',
  status: 'completed',
  date: '2026-10-28',
  created_at: '2026-10-28T10:00:00.000Z',
  data: { membership_id: 'm1' },
}
ok(completedWorkoutNumberOnMembership(oldA, mem, [oldA, oldB]) === 1, 'без штампа: раньше created_at = 1')
ok(completedWorkoutNumberOnMembership(oldB, mem, [oldA, oldB]) === 2, 'без штампа: позже created_at = 2')

const stamped = stampTrainingCompletedAt({ membership_id: 'm1' }, '2026-10-28T11:00:00.000Z')
ok(stamped.completed_at === '2026-10-28T11:00:00.000Z', 'stamp ставит completed_at')
ok(
  stampTrainingCompletedAt(stamped, '2026-10-28T15:00:00.000Z').completed_at === '2026-10-28T11:00:00.000Z',
  'stamp не перезаписывает',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-chronology: all passed')
