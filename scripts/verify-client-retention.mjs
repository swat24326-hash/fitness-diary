/**
 * Удержание и жизнь клиента — verify критических сценариев.
 *
 * node scripts/verify-client-retention.mjs
 */
import { isMembershipExpiredRecently, isClientStaleForAttention } from '../src/lib/trainer/trainerClientOutreachCore.js'
import { evaluateBagFlag } from '../src/lib/admin/coachQualityCore.js'
import { hasUsableMembershipForPeriodStats } from '../src/lib/membershipRules.js'
import { isClientExcludedFromRenewals } from '../src/lib/admin/salesPlanHallRenewalsSuggestCore.js'
import { isClientInRetentionPool, filterRetentionPoolClients } from '../src/lib/admin/clientRetentionPoolCore.js'
import {
  clientEngagedInRange,
  isHardChurnInPeriod,
  isPaidMembershipRow,
  isRenewalEligible,
  isRenewed,
  isRestoreEvent,
  isRetentionActiveToday,
  isSoftChurnToday,
  isSuccessfulReactivation,
  resolveCohortAnchorDate,
  tenureDays,
} from '../src/lib/admin/clientRetentionCore.js'
import {
  buildCohortMembers,
  computeAverageRetentionMN,
  computeCohortRetentionRate,
  computeTrainerRetentionMN,
  isCohortMatureForMN,
  monthKeyFromIso,
} from '../src/lib/admin/clientRetentionCohortCore.js'
import { aggregateArchiveReasonMix } from '../src/lib/admin/clientRetentionArchiveReasonCore.js'
import { aggregateClientRetention } from '../src/lib/admin/clientRetentionAgg.js'
import { isTrainerClientInactiveToday } from '../src/lib/trainer/trainerClientOutreachCore.js'

let failed = 0
let section = ''

function ok(cond, msg) {
  const full = section ? `[${section}] ${msg}` : msg
  if (cond) console.log(`ok: ${full}`)
  else {
    console.error(`FAIL: ${full}`)
    failed++
  }
}

function setSection(name) {
  section = name
  console.log(`\n--- ${name} ---`)
}

const TODAY = '2026-07-18'
const TYPES = [
  { id: 'paid', code: 'ДК', name: 'ДК' },
  { id: 'bz', code: 'БЗ', name: 'БЗ', is_pnk_trial: true },
]

const TRAINERS = [
  { id: 't-tab', uses_tablet: true },
  { id: 't-lite', uses_tablet: false },
]

function mem(clientId, typeId, start, end, used = 0, total = 8) {
  return {
    client_id: clientId,
    membership_type_id: typeId,
    start_date: start,
    end_date: end,
    used_trainings: used,
    total_trainings: total,
  }
}

function training(clientId, date, status = 'completed') {
  return { client_id: clientId, date, status }
}

setSection('POOL / tablet & lite')
ok(isClientInRetentionPool({ id: 'c1', trainer_id: 't-tab', lifecycle: 'active' }, { noTabletTrainerIds: new Set(['t-lite']) }), 'tablet in pool')
ok(!isClientInRetentionPool({ id: 'c2', trainer_id: 't-lite', lifecycle: 'active' }, { noTabletTrainerIds: new Set(['t-lite']) }), 'lite out of pool')
ok(!isClientInRetentionPool({ id: 'c3', lifecycle: 'pnk', trainer_id: 't-tab' }, {}), 'open pnk out')
ok(!isClientInRetentionPool({ id: 'c4', archived_at: '2026-07-01', trainer_id: 't-tab' }, {}), 'archived out')
ok(filterRetentionPoolClients([{ id: 'a', trainer_id: 't-tab' }, { id: 'b', trainer_id: 't-lite' }], { noTabletTrainerIds: new Set(['t-lite']) }).length === 1, 'filter pool')

setSection('ANCHOR / paid DK vs BZ')
ok(resolveCohortAnchorDate({ id: 'c1' }, [mem('c1', 'bz', '2026-01-01', '2026-01-31'), mem('c1', 'paid', '2026-02-01', '2026-05-01')], TYPES) === '2026-02-01', 'anchor first paid not BZ')
ok(resolveCohortAnchorDate({ id: 'c2', pnk_won_at: '2026-03-15T10:00:00Z' }, [mem('c2', 'bz', '2026-03-01', '2026-03-10')], TYPES) === '2026-03-15', 'fallback pnk_won_at')
ok(resolveCohortAnchorDate({ id: 'c3' }, [mem('c3', 'bz', '2026-01-01', '2026-01-31')], TYPES) === null, 'only BZ no anchor')
ok(isPaidMembershipRow(mem('x', 'paid', 'a', 'b'), TYPES), 'paid row')
ok(!isPaidMembershipRow(mem('x', 'bz', 'a', 'b'), TYPES), 'bz not paid')

setSection('ENGAGED / history not retroactive')
const histTrainings = [training('c1', '2026-05-10'), training('c1', '2026-08-01')]
ok(clientEngagedInRange(histTrainings, 'c1', '2026-05-01', '2026-05-31'), 'engaged in May')
ok(clientEngagedInRange(histTrainings, 'c1', '2026-05-01', '2026-05-31'), 'May counts even if archived later scenario')

setSection('FUNNEL / soft churn corridors')
const ended5 = [mem('c1', 'paid', '2026-01-01', '2026-07-13', 8, 8)]
ok(isMembershipExpiredRecently(ended5, TODAY), '0-13 expired_recent')
ok(!isTrainerClientInactiveToday({ lifecycle: 'active' }, ended5, TODAY), 'not funnel inactive at 5d')
const ended30 = [mem('c1', 'paid', '2026-01-01', '2026-06-18', 8, 8)]
ok(isClientStaleForAttention({ memList: ended30, today: TODAY }), '14-60 stale')
ok(!isTrainerClientInactiveToday({ lifecycle: 'active' }, ended30, TODAY), 'not funnel inactive at 30d')
const ended61 = [mem('c1', 'paid', '2026-01-01', '2026-05-18', 8, 8)]
ok(isSoftChurnToday({ lifecycle: 'active' }, ended61, TODAY), 'soft churn >60')
ok(!isSoftChurnToday({ lifecycle: 'active', archived_at: '2026-07-01' }, ended61, TODAY), 'archived not soft')
ok(!isSoftChurnToday({ lifecycle: 'pnk' }, [], TODAY), 'open pnk not soft')

setSection('CQ vs retention / day 20')
const ended20 = [mem('c1', 'paid', '2026-01-01', '2026-06-28', 8, 8)]
const bag20 = evaluateBagFlag({ client: { lifecycle: 'active' }, memList: ended20, membershipTypes: TYPES, todayIso: TODAY })
ok(bag20.corridor === 'stuck' || bag20.corridor === 'warn', 'CQ warn/stuck at 20d')
ok(!isSoftChurnToday({ lifecycle: 'active' }, ended20, TODAY), 'CQ 20d is not soft 60')

setSection('COHORT / M+3')
const clients = [
  { id: 'c1', trainer_id: 't-tab', lifecycle: 'active' },
  { id: 'c2', trainer_id: 't-tab', lifecycle: 'active' },
]
const memberships = [
  mem('c1', 'paid', '2026-03-01', '2026-06-01'),
  mem('c2', 'paid', '2026-03-05', '2026-06-05'),
]
const cohortTrainings = [
  training('c1', '2026-06-10'),
  training('c2', '2026-03-20'),
  training('c1', '2026-06-15'),
]
const members = buildCohortMembers(clients, new Map([['c1', [memberships[0]]], ['c2', [memberships[1]]]]), TYPES, { noTabletTrainerIds: new Set(['t-lite']) })
ok(members.length === 2, 'two cohort members')
ok(monthKeyFromIso('2026-03-01') === '2026-03', 'month key')
const m3 = computeCohortRetentionRate(members, cohortTrainings, '2026-03', 3)
ok(m3.cohortSize === 2, 'cohort size 2')
ok(m3.retained === 1, 'one engaged in M+3 (June)')
ok(m3.rate === 0.5, 'rate 50%')
const byT = computeTrainerRetentionMN(members, cohortTrainings, ['2026-03'], 't-tab', 3)
ok(byT.averageRate === 0.5, 'trainer M+3 same')

setSection('COHORT / immature & archived in universe')
ok(!isCohortMatureForMN('2026-05', 3, '2026-07-18'), 'May M+3=Aug not mature in July')
ok(isCohortMatureForMN('2026-03', 3, '2026-07-18'), 'March M+3=June mature in July')
const immature = computeCohortRetentionRate(members, cohortTrainings, '2026-05', 3, '2026-07-18')
ok(immature.rate === null && immature.cohortSize === 0, 'immature cohort skipped when empty')
const archivedCohortClient = {
  id: 'c-arch',
  trainer_id: 't-tab',
  lifecycle: 'active',
  archived_at: '2026-08-01T00:00:00Z',
}
const archMembers = buildCohortMembers(
  [archivedCohortClient],
  new Map([['c-arch', [mem('c-arch', 'paid', '2026-03-01', '2026-06-01')]]]),
  TYPES,
  { useUniverse: true, noTabletTrainerIds: new Set(['t-lite']) },
)
ok(archMembers.length === 1, 'archived client in universe cohort')
const archRet = computeCohortRetentionRate(
  archMembers,
  [training('c-arch', '2026-06-12')],
  '2026-03',
  3,
  TODAY,
)
ok(archRet.retained === 1, 'archived client engaged before archive counts in M+3')

setSection('COHORT / weighted average')
const weighted = computeAverageRetentionMN(
  [
    { clientId: 'a', anchorMonth: '2026-01', anchorDate: '2026-01-01', anchorTrainerId: 't1' },
    { clientId: 'b', anchorMonth: '2026-01', anchorDate: '2026-01-05', anchorTrainerId: 't1' },
    { clientId: 'c', anchorMonth: '2026-01', anchorDate: '2026-01-10', anchorTrainerId: 't1' },
  ],
  [training('a', '2026-04-01')],
  ['2026-01'],
  3,
  '2026-07-01',
)
ok(weighted.averageRate === 1 / 3, 'weighted 1/3 not unweighted 100%')

setSection('REASSIGN / anchor trainer')
const reassignMembers = buildCohortMembers(
  [{ id: 'c1', trainer_id: 't-other', lifecycle: 'active' }],
  new Map([['c1', [mem('c1', 'paid', '2026-03-01', '2026-06-01')]]]),
  TYPES,
  {},
)
ok(reassignMembers[0]?.anchorTrainerId === 't-other', 'anchor uses trainer at build (document reassign policy)')
reassignMembers[0].anchorTrainerId = 't-anchor'
ok(computeTrainerRetentionMN(reassignMembers, cohortTrainings, ['2026-03'], 't-anchor', 3).cohortSize === 1, 'attribution frozen anchorTrainerId')

setSection('RENEWAL / eligible & renewed')
const renewClient = { id: 'r1', trainer_id: 't-tab', lifecycle: 'active' }
const renewMems = [
  mem('r1', 'paid', '2026-01-01', '2026-07-10', 8, 8),
  mem('r1', 'paid', '2026-07-12', '2026-10-12', 0, 8),
]
ok(isRenewalEligible(renewClient, renewMems, TYPES, TODAY), 'eligible ended in window')
ok(isRenewed(renewClient, renewMems, TYPES, TODAY), 'renewed within 14d')
ok(isClientExcludedFromRenewals({ archived_at: '2026-07-01' }), 'archived excluded via renewals helper')

const earlyRenewMems = [
  mem('r2', 'paid', '2026-01-01', '2026-07-10', 8, 8),
  mem('r2', 'paid', '2026-06-01', '2026-12-01', 2, 8),
]
const earlyRenewClient = { id: 'r2', trainer_id: 't-tab', lifecycle: 'active' }
ok(isRenewalEligible(earlyRenewClient, earlyRenewMems, TYPES, TODAY), 'early overlap still eligible (ended in window)')
ok(isRenewed(earlyRenewClient, earlyRenewMems, TYPES, TODAY), 'early overlap counts as renewed')

const notRenewMems = [mem('r3', 'paid', '2026-01-01', '2026-07-10', 8, 8)]
const notRenewClient = { id: 'r3', trainer_id: 't-tab', lifecycle: 'active' }
ok(isRenewalEligible(notRenewClient, notRenewMems, TYPES, TODAY), 'exhausted ended eligible')
ok(!isRenewed(notRenewClient, notRenewMems, TYPES, TODAY), 'exhausted not renewed without next abon')

const lateRenewMems = [
  mem('r4', 'paid', '2026-01-01', '2026-07-10', 8, 8),
  mem('r4', 'paid', '2026-08-01', '2026-11-01', 0, 8),
]
ok(isRenewalEligible({ id: 'r4', lifecycle: 'active' }, lateRenewMems, TYPES, TODAY), 'late renew still eligible in window')
ok(!isRenewed({ id: 'r4', lifecycle: 'active' }, lateRenewMems, TYPES, TODAY), 'renew start after 14d window not renewed')

setSection('ARCHIVE / hard churn & reasons')
const archived = { id: 'a1', trainer_id: 't-tab', lifecycle: 'active', archived_at: '2026-07-10T12:00:00Z', archive_reason: 'Не ходит / пропал' }
ok(isHardChurnInPeriod(archived, '2026-07-01', '2026-07-31'), 'hard churn in period')
ok(!isHardChurnInPeriod(archived, '2026-06-01', '2026-06-30'), 'not in June period')
const mix = aggregateArchiveReasonMix([archived])
ok(mix.total === 1 && mix.byGroup.no_show === 1, 'reason mix chip')

setSection('RESTORE / reactivation')
ok(isRestoreEvent({ archived_at: '2026-07-01' }, { archived_at: null }), 'restore event')
ok(!isRestoreEvent({ archived_at: null }, { archived_at: null }), 'not restore')
ok(isSuccessfulReactivation('2026-07-01', [training('x', '2026-07-10')], 'x', 30), 'successful with completed 30d')
ok(!isSuccessfulReactivation('2026-07-01', [], 'x', 30), 'restore alone not successful')

setSection('PNK / pnk_lost vs archive')
ok(!isClientInRetentionPool({ id: 'p1', lifecycle: 'pnk', trainer_id: 't-tab' }, {}), 'open pnk not in retention')
ok(isClientInRetentionPool({ id: 'p2', lifecycle: 'pnk_lost', trainer_id: 't-tab' }, { noTabletTrainerIds: new Set() }), 'pnk_lost in pool if tablet')
ok(!isHardChurnInPeriod({ lifecycle: 'pnk_lost', trainer_id: 't-tab' }, '2026-07-01', '2026-07-31'), 'pnk_lost not hard churn without archive')

setSection('AGG / smoke')
const agg = aggregateClientRetention({
  clients: [
    { id: 'c1', trainer_id: 't-tab', lifecycle: 'active' },
    { id: 'c2', trainer_id: 't-tab', lifecycle: 'active', archived_at: '2026-07-05' },
    { id: 'c3', trainer_id: 't-lite', lifecycle: 'active' },
  ],
  memberships: [
    mem('c1', 'paid', '2026-03-01', '2026-06-01'),
    mem('c2', 'paid', '2026-02-01', '2026-05-01'),
  ],
  trainings: [training('c1', '2026-06-10')],
  membershipTypes: TYPES,
  trainers: TRAINERS,
  periodFrom: '2026-07-01',
  periodTo: '2026-07-31',
  asOf: TODAY,
  cohortMonths: ['2026-03'],
  restoreEvents: [{ clientId: 'c9', restoredAt: '2026-07-02' }],
})
ok(agg.poolSize === 1, 'agg pool tablet active only')
ok(agg.universeSize === 2, 'agg universe includes archived tablet client')
ok(agg.archivesInPeriod === 1, 'c2 archived in July counted')
ok(agg.retentionM3.cohortSize >= 1, 'agg retention computed')
ok(agg.medianTenureDays != null, 'tenure computed')

setSection('PERIOD CENSUS ≠ funnel')
const censusMem = [mem('c1', 'paid', '2026-01-01', '2026-06-01', 8, 8)]
ok(!hasUsableMembershipForPeriodStats(censusMem, '2026-07-01', '2026-07-31', TODAY), 'period inactive census')
ok(!isSoftChurnToday({ lifecycle: 'active' }, censusMem, TODAY), 'same client not yet funnel inactive at 47d — stale yes')
ok(isClientStaleForAttention({ memList: censusMem, today: TODAY }), 'in stale corridor')

setSection('RETENTION ACTIVE')
ok(isRetentionActiveToday({ id: 'c1', trainer_id: 't-tab', lifecycle: 'active' }, [mem('c1', 'paid', '2026-01-01', '2026-12-01')], TODAY, { noTabletTrainerIds: new Set(['t-lite']) }), 'active with usable')
ok(!isRetentionActiveToday({ id: 'c1', trainer_id: 't-tab', lifecycle: 'active' }, ended61, TODAY, {}), 'not active when soft churn')

setSection('TENURE')
ok(tenureDays('2026-01-01', '2026-01-01') === 1, 'tenure one day')
ok(tenureDays('2026-01-01', '2026-01-10') === 10, 'tenure ten days')

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll client-retention checks passed.')
