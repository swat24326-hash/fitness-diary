/**
 * Старт бесплатной ПНК: БЗ + путь к форме тренировки.
 */
import {
  buildPnkNewWorkoutPath,
  buildPnkTrialMembershipRow,
  findPnkTrialMembershipType,
  resolvePnkStartTrainingAction,
  shouldOfferMarkPnkTrialDone,
} from '../src/lib/pnk/pnkTrialTrainingCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok - ${msg}`)
  else {
    console.error(`FAIL - ${msg}`)
    failed += 1
  }
}

const types = [
  { id: 't1', code: 'ДК', is_active: true, is_pnk_trial: false },
  { id: 'bz', code: 'БЗ', is_active: true, is_pnk_trial: true },
]
ok(findPnkTrialMembershipType(types)?.id === 'bz', 'find БЗ type')
ok(findPnkTrialMembershipType([{ id: 'x', is_pnk_trial: true, is_active: false }]) == null, 'inactive БЗ ignored')

const usable = [
  {
    id: 'm1',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    total_trainings: 1,
    used_trainings: 0,
  },
]
ok(
  resolvePnkStartTrainingAction({ memberships: usable, membershipTypes: types, todayIso: '2026-07-17' }).action ===
    'open',
  'open when membership usable',
)

ok(
  resolvePnkStartTrainingAction({ memberships: [], membershipTypes: types, todayIso: '2026-07-17' }).action ===
    'create_bz',
  'create БЗ when no membership',
)

const depletedBz = [
  {
    id: 'm-old',
    membership_type_id: 'bz',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    total_trainings: 1,
    used_trainings: 1,
  },
]
ok(
  resolvePnkStartTrainingAction({
    memberships: depletedBz,
    membershipTypes: types,
    todayIso: '2026-07-17',
  }).action === 'create_bz',
  'second БЗ without confirm when depleted',
)
ok(
  resolvePnkStartTrainingAction({
    memberships: usable,
    membershipTypes: types,
    todayIso: '2026-07-17',
    forceNewBz: true,
  }).action === 'create_bz',
  'force add another БЗ while one usable',
)

ok(
  resolvePnkStartTrainingAction({ memberships: [], membershipTypes: [{ id: 'dk', is_pnk_trial: false }], todayIso: '2026-07-17' })
    .action === 'need_bz_type',
  'need type when no БЗ',
)

const row = buildPnkTrialMembershipRow({
  id: 'new-m',
  clientId: 'c1',
  clubId: 'club1',
  membershipTypeId: 'bz',
  todayIso: '2026-07-17',
  nowIso: '2026-07-17T10:00:00.000Z',
})
ok(row.total_trainings === 1 && row.used_trainings === 0, 'БЗ one session')
ok(row.start_date === '2026-07-17' && row.end_date === '2026-07-31', 'БЗ from today +14d, not funnel date')
ok(row.membership_type_id === 'bz', 'membership type БЗ')

const path = buildPnkNewWorkoutPath({ clientId: 'c1', clubId: 'club1' })
ok(path === '/trainer/workouts/new?clientId=c1&club=club1', 'trainer workout path')
ok(
  buildPnkNewWorkoutPath({ clientId: 'c1', isAdmin: true }) === '/admin/workouts/new?clientId=c1',
  'admin workout path',
)

ok(
  shouldOfferMarkPnkTrialDone({
    lifecycle: 'pnk',
    pnk_stage: 'agreed',
    pnk_trial_date: '2026-07-17',
    pnk_deliverables: { contact: 'x' },
  }),
  'offer mark trial after workout',
)
ok(
  !shouldOfferMarkPnkTrialDone({
    lifecycle: 'pnk',
    pnk_stage: 'trial_done',
    pnk_trial_date: '2026-07-17',
    pnk_deliverables: { trial: 'x' },
  }),
  'no offer if already trial_done',
)
ok(!shouldOfferMarkPnkTrialDone({ lifecycle: 'active' }), 'no offer for DK client')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-pnk-trial-training: all ok')
