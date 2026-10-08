/**
 * node scripts/verify-training-draft-page-epoch.mjs
 */
import {
  isTrainingDraftEpochCurrent,
  resolveTrainingFormRemountKey,
  resolveTrainingPersistTargetId,
  shouldApplyTrainingPersistUi,
  shouldAcceptDraftWorkoutEdit,
} from '../src/lib/trainingDraftPageEpochCore.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isTrainingDraftEpochCurrent(3, 3), 'epoch match')
ok(!isTrainingDraftEpochCurrent(4, 3), 'stale epoch rejected')
ok(!isTrainingDraftEpochCurrent(2, 3), 'future capture rejected')

ok(
  resolveTrainingPersistTargetId({
    routeId: 'draft-b',
    metaTrainingId: 'draft-a',
    draftRefId: 'draft-a',
  }) === 'draft-b',
  'route id wins over stale meta (split tabs)',
)

ok(
  resolveTrainingPersistTargetId({
    routeId: 'new',
    metaTrainingId: 'pending-1',
    draftRefId: 'pending-1',
  }) === 'pending-1',
  'new route uses meta/draft',
)

ok(
  resolveTrainingPersistTargetId({
    routeId: null,
    metaTrainingId: null,
    draftRefId: 'from-ref',
  }) === 'from-ref',
  'draft ref fallback',
)

ok(resolveTrainingPersistTargetId({}) == null, 'empty → null')

ok(
  resolveTrainingFormRemountKey({ routeId: 'draft-a', clientId: 'c1' }) === 'draft-a',
  'remount key = route for existing',
)
ok(
  resolveTrainingFormRemountKey({ routeId: 'new', clientId: 'c1' }) === 'new:c1',
  'remount key stable on /new (no meta.trainingId)',
)
ok(
  resolveTrainingFormRemountKey({ routeId: 'new', clientId: '' }) === 'new',
  'remount key new without client',
)

ok(
  shouldApplyTrainingPersistUi({ currentEpoch: 5, persistEpoch: 5 }),
  'same tab → UI ok',
)
ok(
  !shouldApplyTrainingPersistUi({ currentEpoch: 6, persistEpoch: 5 }),
  'switched tab → no UI to foreign screen (disk still writes)',
)

ok(
  shouldAcceptDraftWorkoutEdit({
    ownerRouteId: 'draft-a',
    liveRouteId: 'draft-a',
    ownerEpoch: 3,
    currentEpoch: 3,
  }),
  'edit accepted on same tab',
)
ok(
  !shouldAcceptDraftWorkoutEdit({
    ownerRouteId: 'draft-a',
    liveRouteId: 'draft-b',
    ownerEpoch: 3,
    currentEpoch: 3,
  }),
  'CRITICAL: late blur after tab tap does not edit other draft',
)
ok(
  !shouldAcceptDraftWorkoutEdit({
    ownerRouteId: 'draft-a',
    liveRouteId: 'draft-a',
    ownerEpoch: 3,
    currentEpoch: 4,
  }),
  'stale epoch edit dropped after tab switch',
)
ok(
  !shouldAcceptDraftWorkoutEdit({
    ownerRouteId: 'draft-a',
    liveRouteId: 'draft-b',
    ownerEpoch: 2,
    currentEpoch: 5,
  }),
  'form instance of A + header blur after tap B: both route and epoch reject',
)

ok(
  shouldAcceptDraftWorkoutEdit({ ownerRouteId: 'new', liveRouteId: 'draft-a', promotedFromNewId: 'draft-a' }),
  '/new → /draft-a после первого save: ввод в форме /new не теряется',
)
ok(
  !shouldAcceptDraftWorkoutEdit({ ownerRouteId: 'new', liveRouteId: 'draft-b', promotedFromNewId: 'draft-a' }),
  'CRITICAL: ввод с /new клиента A не попадает в черновик B',
)
ok(
  !shouldAcceptDraftWorkoutEdit({ ownerRouteId: 'new', liveRouteId: 'draft-a' }),
  'без повышения /new чужой маршрут по-прежнему отклоняется',
)
ok(
  !shouldAcceptDraftWorkoutEdit({ ownerRouteId: 'draft-c', liveRouteId: 'draft-a', promotedFromNewId: 'draft-a' }),
  'повышение /new не открывает дверь правкам с других черновиков',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-training-draft-page-epoch: all passed')
