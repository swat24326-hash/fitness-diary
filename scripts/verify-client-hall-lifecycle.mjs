/**
 * node scripts/verify-client-hall-lifecycle.mjs
 */
import {
  applyMembershipPatches,
  buildEndLiveMembershipsForHall,
  buildHallCloseFields,
  hasLiveMembershipForHall,
  isHallOpen,
  isTrainerPzActiveView,
  isTrainerPzClosedView,
  listOpenHalls,
  planCloseHall,
  planLeaveClub,
  planReopenHall,
  reconcileClubArchiveDecision,
  shouldPromptClosePzOnDeskSale,
  trainerClosedListBadge,
  detectLoyaltyPzHallCloseBurn,
} from '../src/lib/clientHallLifecycleCore.js'
import { clientMatchesAdminFunnelFilter } from '../src/lib/admin/adminClientsFunnelCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const client = { id: 'c1', club_id: 'club1', trainer_id: 't1', archived_at: null }
const pzMem = {
  id: 'm-pz',
  client_id: 'c1',
  hall: 'pz',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  total_trainings: 10,
  used_trainings: 1,
}
const tzMem = {
  id: 'm-tz',
  client_id: 'c1',
  hall: 'tz',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  total_trainings: 0,
  used_trainings: 0,
}

ok(hasLiveMembershipForHall([pzMem], 'pz', '2026-08-21', client), 'live pz')
ok(hasLiveMembershipForHall([tzMem], 'tz', '2026-08-21', client), 'live tz')
ok(isHallOpen({ client, memberships: [pzMem, tzMem], lifecycleRows: [], hall: 'pz', asOf: '2026-08-21' }), 'pz open')
ok(listOpenHalls({ client, memberships: [pzMem, tzMem], lifecycleRows: [], asOf: '2026-08-21' }).join(',') === 'pz,tz', 'open pz+tz')

ok(buildHallCloseFields('').ok === false, 'close needs reason')
ok(buildHallCloseFields('Не ходит / пропал').ok === true, 'close reason ok')

const endPatches = buildEndLiveMembershipsForHall([pzMem], 'pz', '2026-08-21', client)
ok(endPatches.length === 1 && endPatches[0].end_date === '2026-08-20', 'end pz mem yesterday')

const closeMixed = planCloseHall({
  client,
  hall: 'pz',
  reasonInput: 'Перешёл в ТЗ',
  memberships: [pzMem, tzMem],
  lifecycleRows: [],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T12:00:00.000Z',
})
ok(closeMixed.ok === true, 'close pz with tz ok')
ok(closeMixed.clubArchiveEntered === false, 'no club archive when tz live')
ok(closeMixed.burnsLoyaltyPz === true, 'burns loyalty on pz close')
ok(closeMixed.lifecycleRow?.hall === 'pz' && closeMixed.lifecycleRow?.closed_at, 'lifecycle closed')
ok(closeMixed.clientPatch == null, 'client not archived')

const closeOnlyPz = planCloseHall({
  client,
  hall: 'pz',
  reasonInput: 'Не вернётся',
  memberships: [pzMem],
  lifecycleRows: [],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T12:00:00.000Z',
})
ok(closeOnlyPz.ok === true && closeOnlyPz.clubArchiveEntered === true, 'only pz → club archive')
ok(closeOnlyPz.clientPatch?.archived_at, 'archived_at set')
ok(closeOnlyPz.burnsLoyaltyPz === false, 'club archive burns via clients not double')

const afterClose = applyMembershipPatches([pzMem, tzMem], closeMixed.membershipPatches)
ok(!hasLiveMembershipForHall(afterClose, 'pz', '2026-08-21', client), 'pz dead after close')
ok(hasLiveMembershipForHall(afterClose, 'tz', '2026-08-21', client), 'tz still live')

const reopenFail = planReopenHall({
  client,
  hall: 'pz',
  memberships: afterClose,
  lifecycleRows: [closeMixed.lifecycleRow],
  asOf: '2026-08-21',
})
ok(reopenFail.ok === false, 'reopen needs live mem')

const pzNew = {
  ...pzMem,
  id: 'm-pz2',
  start_date: '2026-08-21',
  end_date: '2026-11-21',
  used_trainings: 0,
}
const reopenOk = planReopenHall({
  client: { ...client, archived_at: null },
  hall: 'pz',
  memberships: [...afterClose, pzNew],
  lifecycleRows: [closeMixed.lifecycleRow],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T13:00:00.000Z',
})
ok(reopenOk.ok === true && reopenOk.lifecycleRow.closed_at == null, 'reopen clears closed')

ok(
  isTrainerPzClosedView(client, [closeMixed.lifecycleRow]) === true,
  'trainer closed view',
)
ok(isTrainerPzActiveView(client, []) === true, 'trainer active view')
ok(
  trainerClosedListBadge({
    client,
    memberships: afterClose,
    lifecycleRows: [closeMixed.lifecycleRow],
    asOf: '2026-08-21',
  }) === 'has_tz',
  'badge has_tz',
)

const leave = planLeaveClub({
  client,
  reasonInput: 'Переехал / другой зал',
  memberships: [pzMem, tzMem],
  lifecycleRows: [],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T14:00:00.000Z',
})
ok(leave.ok === true && leave.clientPatch?.archived_at, 'leave club archives')
ok(leave.lifecycleRows?.length >= 1, 'leave closes halls')

ok(
  shouldPromptClosePzOnDeskSale({
    saleHall: 'tz',
    client,
    memberships: [pzMem, tzMem],
    lifecycleRows: [],
    asOf: '2026-08-21',
  }) === true,
  'prompt close pz on tz sale',
)
ok(
  shouldPromptClosePzOnDeskSale({
    saleHall: 'tz',
    client,
    memberships: [tzMem],
    lifecycleRows: [],
    asOf: '2026-08-21',
  }) === false,
  'no prompt without pz',
)

const burn = detectLoyaltyPzHallCloseBurn({
  before: { client_id: 'c1', club_id: 'club1', hall: 'pz', closed_at: null },
  after: closeMixed.lifecycleRow,
})
ok(burn.write === true, 'loyalty burn on pz close')

const decisionOpen = reconcileClubArchiveDecision({
  client,
  memberships: [tzMem],
  lifecycleRows: [closeMixed.lifecycleRow],
  asOf: '2026-08-21',
})
ok(decisionOpen.shouldArchive === false, 'reconcile keeps live with tz')

ok(
  clientMatchesAdminFunnelFilter('inactive', {
    client,
    memList: [{ ...pzMem, end_date: '2026-01-01', used_trainings: 10 }],
    today: '2026-08-21',
    hallMode: 'pz',
    lifecycleRows: [{ client_id: 'c1', hall: 'pz', closed_at: '2026-08-01T00:00:00Z' }],
  }) === false,
  'funnel inactive skips closed pz',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-client-hall-lifecycle: ok')
