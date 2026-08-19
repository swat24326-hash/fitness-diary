/**
 * Привязка membership_id к завершённой тренировке (fallback по дате).
 */
import {
  ensureTrainingDataMembershipId,
  repairTrainingsMembershipLinks,
} from '../src/lib/trainingMembershipLinkCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const mems = [
  {
    id: 'm-vet',
    client_id: 'c-vet',
    membership_type_id: 't8g',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    total_trainings: 8,
    used_trainings: 3,
  },
]

const training = {
  id: 't1',
  client_id: 'c-vet',
  status: 'completed',
  date: '2026-08-19',
  data: { training_focus: 'Спина' },
}

const linked = ensureTrainingDataMembershipId(training, mems)
ok(linked.data?.membership_id === 'm-vet', 'fills membership_id by date when missing')

const kept = ensureTrainingDataMembershipId(
  { ...training, data: { membership_id: 'm-vet', training_focus: 'Спина' } },
  mems,
)
ok(kept.data?.membership_id === 'm-vet', 'keeps existing membership_id')

const batch = repairTrainingsMembershipLinks(
  [
    training,
    { id: 'd1', status: 'draft', client_id: 'c-vet', date: '2026-08-19', data: {} },
  ],
  mems,
)
ok(batch[0].data?.membership_id === 'm-vet', 'repair batch links completed only')
ok(!batch[1].data?.membership_id, 'repair skips draft')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll training-membership-link checks passed.')
