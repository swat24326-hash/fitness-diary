/**
 * Плитка «Трен. n/m»: завершённая = номер в дневнике, черновик = следующая.
 * node scripts/verify-training-membership-tile.mjs
 */
import { buildTrainingMembershipTileSummary } from '../src/lib/trainer/trainingMembershipTileCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const el = {
  id: 'm-el',
  start_date: '2026-08-18',
  end_date: '2026-08-31',
  total_trainings: 4,
  used_trainings: 1,
}

const bz = {
  id: 'm-bz',
  start_date: '2026-08-22',
  end_date: '2026-09-05',
  total_trainings: 1,
  used_trainings: 1,
}

const t1 = {
  id: 't-el-1',
  status: 'completed',
  date: '2026-08-24',
  data: { membership_id: 'm-el', training_focus: 'Спина' },
}

const tBz = {
  id: 't-bz-1',
  status: 'completed',
  date: '2026-08-22',
  data: { membership_id: 'm-bz' },
}

const all = [tBz, t1]
const mems = [el, bz]

const editFirst = buildTrainingMembershipTileSummary({
  memberships: mems,
  allTrainings: all,
  training: t1,
  trainingDate: '2026-08-24',
  status: 'completed',
})
ok(editFirst?.current === 1 && editFirst?.total === 4, 'CRITICAL: edit completed 1/4 → tile 1/4 (not used+1=2)')
ok(editFirst?.membershipId === 'm-el', 'completed tile binds El membership, not BZ')

const draftNext = buildTrainingMembershipTileSummary({
  memberships: [{ ...el, used_trainings: 1 }],
  allTrainings: all,
  training: null,
  trainingDate: '2026-08-24',
  status: 'draft',
})
ok(draftNext?.current === 2 && draftNext?.total === 4, 'draft after 1 used → next 2/4')

const draftStaleUsed = buildTrainingMembershipTileSummary({
  memberships: [{ ...el, used_trainings: 0 }],
  allTrainings: all,
  training: { id: 't-draft', status: 'draft', date: '2026-08-26' },
  trainingDate: '2026-08-26',
  status: 'draft',
})
ok(
  draftStaleUsed?.current === 2 && draftStaleUsed?.total === 4,
  'CRITICAL: draft with stale used=0 but diary has 1 completed → next 2/4 (not 1/4)',
)

const secondOnEl = {
  id: 't-el-2',
  status: 'completed',
  date: '2026-08-25',
  data: { membership_id: 'm-el' },
}
const editSecond = buildTrainingMembershipTileSummary({
  memberships: [{ ...el, used_trainings: 2 }],
  allTrainings: [...all, secondOnEl],
  training: secondOnEl,
  status: 'completed',
})
ok(editSecond?.current === 2 && editSecond?.total === 4, 'second completed on El → 2/4')

const noMem = buildTrainingMembershipTileSummary({
  memberships: [],
  allTrainings: all,
  training: t1,
  status: 'completed',
})
ok(noMem == null, 'no memberships → null')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll training-membership-tile checks passed')
