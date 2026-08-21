/**
 * node scripts/verify-client-hall-lifecycle.mjs
 */
import {
  applyMembershipPatches,
  buildAutoCloseHallsWithoutLiveMembership,
  buildEndLiveMembershipsForHall,
  buildHallCloseFields,
  hasLiveMembershipForHall,
  isHallOpen,
  isTrainerPzActiveView,
  isTrainerPzClosedView,
  listOpenHalls,
  planCloseHall,
  planEnsureOpenHallAfterMembership,
  planLeaveClub,
  planReopenHall,
  reconcileClubArchiveDecision,
  shouldPromptClosePzOnDeskSale,
  trainerClosedListBadge,
  detectLoyaltyPzHallCloseBurn,
} from '../src/lib/clientHallLifecycleCore.js'
import {
  adminClientsCloseHallLabel,
  adminClientsCloseHallModalCopy,
  adminClientsReopenHallLabel,
  resolveAdminClientsActionHall,
  shouldOfferAdminCloseHall,
  shouldOfferAdminReopenHall,
} from '../src/lib/admin/adminClientsHallLifecycleMenuCore.js'
import {
  buildArchiveReasonConfirmPayload,
  isArchiveReasonModalReady,
} from '../src/lib/clientArchiveReasonCore.js'
import { clientMatchesAdminFunnelFilter } from '../src/lib/admin/adminClientsFunnelCore.js'
import {
  cloudPutAllowedOnPull,
  isPullMergeGuardedStore,
} from '../src/lib/syncPullGuardCore.js'
import { shouldPreserveLocalRowOnPull } from '../src/lib/syncFlushResult.js'

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
  isTrainerPzClosedView(client, [closeMixed.lifecycleRow], afterClose, '2026-08-21') === true,
  'trainer closed view',
)
ok(isTrainerPzActiveView(client, [], [pzMem], '2026-08-21') === true, 'trainer active view')
ok(
  isTrainerPzClosedView(client, [], [{ ...pzMem, end_date: '2026-01-01', used_trainings: 10 }], '2026-08-21') ===
    true,
  'closed when pz dead without lifecycle row',
)
ok(
  isTrainerPzActiveView(client, [], [{ ...pzMem, end_date: '2026-01-01', used_trainings: 10 }], '2026-08-21') ===
    false,
  'not active when pz dead without lifecycle row',
)
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
  }) === true,
  'funnel inactive as before (lifecycle closed does not hide chip)',
)

const azMem = {
  id: 'm-az',
  client_id: 'c1',
  hall: 'az',
  start_date: '2026-08-10',
  end_date: '2026-09-10',
  total_trainings: 0,
  used_trainings: 0,
}
const archivedClient = {
  ...client,
  archived_at: '2026-08-01T00:00:00Z',
  archive_reason: 'Перешёл в АЗ',
}
const leaveThenAz = planEnsureOpenHallAfterMembership({
  client: archivedClient,
  hall: 'az',
  memberships: [azMem],
  lifecycleRows: [
    { id: 'l-pz', client_id: 'c1', club_id: 'club1', hall: 'pz', closed_at: '2026-08-01T00:00:00Z' },
    { id: 'l-az', client_id: 'c1', club_id: 'club1', hall: 'az', closed_at: '2026-08-01T00:00:00Z' },
  ],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T12:00:00.000Z',
})
ok(leaveThenAz.ok === true && !leaveThenAz.skipped, 'ensure after AZ: not skipped')
ok(leaveThenAz.lifecycleRow?.closed_at == null, 'ensure after AZ: clears az closed_at')
ok(leaveThenAz.clientPatch?.archived_at == null, 'ensure after AZ: restores from club archive')

const onlyRestore = planEnsureOpenHallAfterMembership({
  client: archivedClient,
  hall: 'az',
  memberships: [azMem],
  lifecycleRows: [],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T12:00:00.000Z',
})
ok(onlyRestore.ok && onlyRestore.clientPatch?.archived_at == null, 'ensure: restore when AZ live without lifecycle row')
ok(
  planEnsureOpenHallAfterMembership({
    client,
    hall: 'az',
    memberships: [azMem],
    lifecycleRows: [],
    asOf: '2026-08-21',
  }).skipped === true,
  'ensure: skip when already live in club',
)

// --- Критическая матрица (архив ↔ абоны ↔ close) ---
const upcomingAz = {
  id: 'm-az-up',
  client_id: 'c1',
  hall: 'az',
  start_date: '2026-09-01',
  end_date: '2026-10-01',
  total_trainings: 0,
  used_trainings: 0,
}
ok(hasLiveMembershipForHall([upcomingAz], 'az', '2026-08-21', client), 'upcoming AZ = presence')
ok(
  planCloseHall({
    client,
    hall: 'pz',
    reasonInput: 'Перешёл в АЗ',
    memberships: [pzMem, upcomingAz],
    lifecycleRows: [],
    asOf: '2026-08-21',
    nowIso: '2026-08-21T12:00:00.000Z',
  }).clubArchiveEntered === false,
  'close PZ with upcoming AZ: no club archive',
)
const ensureUpcoming = planEnsureOpenHallAfterMembership({
  client: archivedClient,
  hall: 'az',
  memberships: [upcomingAz],
  lifecycleRows: [
    { id: 'l-az2', client_id: 'c1', club_id: 'club1', hall: 'az', closed_at: '2026-08-01T00:00:00Z' },
  ],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T12:00:00.000Z',
})
ok(ensureUpcoming.ok && ensureUpcoming.clientPatch?.archived_at == null, 'ensure: upcoming AZ restores archive')
ok(ensureUpcoming.lifecycleRow?.closed_at == null, 'ensure: upcoming AZ clears closed_at')

const depletedAz = {
  id: 'm-az-dep',
  client_id: 'c1',
  hall: 'az',
  start_date: '2026-08-01',
  end_date: '2026-09-01',
  total_trainings: 8,
  used_trainings: 8,
}
ok(!hasLiveMembershipForHall([depletedAz], 'az', '2026-08-21', client), 'depleted AZ not presence')
ok(
  planEnsureOpenHallAfterMembership({
    client: archivedClient,
    hall: 'az',
    memberships: [depletedAz],
    lifecycleRows: [],
    asOf: '2026-08-21',
  }).skipped === true,
  'ensure: depleted AZ does not restore',
)

const expiredAz = {
  id: 'm-az-ex',
  client_id: 'c1',
  hall: 'az',
  start_date: '2026-01-01',
  end_date: '2026-02-01',
  total_trainings: 0,
  used_trainings: 0,
}
ok(!hasLiveMembershipForHall([expiredAz], 'az', '2026-08-21', client), 'expired AZ not presence')
ok(
  planEnsureOpenHallAfterMembership({
    client: archivedClient,
    hall: 'az',
    memberships: [expiredAz],
    lifecycleRows: [],
    asOf: '2026-08-21',
  }).skipped === true,
  'ensure: expired AZ does not restore',
)

const closeThenLeave = planLeaveClub({
  client: { ...client, archived_at: null },
  reasonInput: 'Ушёл из клуба',
  memberships: [pzMem, tzMem],
  lifecycleRows: [],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T12:00:00.000Z',
})
ok(closeThenLeave.ok && closeThenLeave.clientPatch?.archived_at, 'leave: archives')
ok(
  (closeThenLeave.lifecycleRows ?? []).every((r) => r.closed_at),
  'leave: all halls closed_at',
)

const afterLeaveAz = planEnsureOpenHallAfterMembership({
  client: { ...client, archived_at: closeThenLeave.clientPatch.archived_at },
  hall: 'az',
  memberships: [azMem],
  lifecycleRows: [
    ...(closeThenLeave.lifecycleRows ?? []),
    {
      id: 'l-az-left',
      client_id: 'c1',
      club_id: 'club1',
      hall: 'az',
      closed_at: '2026-08-21T12:00:00.000Z',
    },
  ],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T13:00:00.000Z',
})
ok(afterLeaveAz.ok && !afterLeaveAz.skipped, 'after leave+AZ ensure runs')
ok(afterLeaveAz.clientPatch?.archived_at == null, 'after leave+AZ: out of club archive')
ok(
  afterLeaveAz.lifecycleRow?.hall === 'az' && afterLeaveAz.lifecycleRow?.closed_at == null,
  'after leave+AZ: az reopened',
)

const afterLeaveNewAzOnly = planEnsureOpenHallAfterMembership({
  client: { ...client, archived_at: '2026-08-21T12:00:00.000Z' },
  hall: 'az',
  memberships: [azMem],
  lifecycleRows: closeThenLeave.lifecycleRows,
  asOf: '2026-08-21',
  nowIso: '2026-08-21T13:00:00.000Z',
})
ok(
  afterLeaveNewAzOnly.ok && afterLeaveNewAzOnly.clientPatch?.archived_at == null,
  'after leave + first AZ ever: restore without prior az lifecycle',
)

ok(
  planEnsureOpenHallAfterMembership({
    client: archivedClient,
    hall: 'pz',
    memberships: [pzMem],
    lifecycleRows: [
      { id: 'l-pz3', client_id: 'c1', club_id: 'club1', hall: 'pz', closed_at: '2026-08-01T00:00:00Z' },
    ],
    asOf: '2026-08-21',
    nowIso: '2026-08-21T12:00:00.000Z',
  }).clientPatch?.archived_at == null,
  'ensure: live PZ package restores archive',
)

ok(isPullMergeGuardedStore('client_hall_lifecycle'), 'pull-guard: client_hall_lifecycle')
ok(
  cloudPutAllowedOnPull('client_hall_lifecycle', 'life-1', {
    client_hall_lifecycle: new Set(['life-1']),
  }) === false,
  'pull-guard: pending lifecycle not overwritten',
)

ok(resolveAdminClientsActionHall('tz') === 'tz', 'menu: tab tz → hall tz')
ok(resolveAdminClientsActionHall('az') === 'az', 'menu: tab az → hall az')
ok(resolveAdminClientsActionHall('active') === 'pz', 'menu: tab active → hall pz')
ok(adminClientsCloseHallLabel('tz') === 'Закрыть ТЗ', 'menu: label close TZ')
ok(adminClientsCloseHallLabel('az') === 'Закрыть АЗ', 'menu: label close AZ')
ok(adminClientsReopenHallLabel('tz') === 'Снова ТЗ', 'menu: label reopen TZ')
ok(
  adminClientsCloseHallModalCopy('az').enterTitle === 'Закрыть АЗ',
  'menu: modal title AZ',
)

const tzLive = {
  id: 'm-tz2',
  client_id: 'c1',
  club_id: 'club1',
  hall: 'tz',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  total_trainings: 12,
  used_trainings: 0,
}
const azLive = {
  id: 'm-az2',
  client_id: 'c1',
  club_id: 'club1',
  hall: 'az',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  total_trainings: 8,
  used_trainings: 0,
}
const lifeTzClosed = {
  id: 'l-tz',
  client_id: 'c1',
  club_id: 'club1',
  hall: 'tz',
  closed_at: '2026-08-01T00:00:00Z',
}
ok(
  shouldOfferAdminCloseHall({
    clientsTab: 'tz',
    client,
    memberships: [tzLive],
    lifecycleRows: [],
    asOf: '2026-08-21',
  }),
  'phase2: offer close TZ when open',
)
ok(
  !shouldOfferAdminCloseHall({
    clientsTab: 'tz',
    client,
    memberships: [tzLive],
    lifecycleRows: [lifeTzClosed],
    asOf: '2026-08-21',
  }),
  'phase2: no close TZ when closed_at',
)
ok(
  shouldOfferAdminReopenHall({
    clientsTab: 'tz',
    client,
    memberships: [tzLive],
    lifecycleRows: [lifeTzClosed],
    asOf: '2026-08-21',
  }),
  'phase2: offer reopen TZ when closed + live mem',
)
ok(
  !shouldOfferAdminReopenHall({
    clientsTab: 'tz',
    client,
    memberships: [],
    lifecycleRows: [lifeTzClosed],
    asOf: '2026-08-21',
  }),
  'phase2: no reopen TZ without live mem',
)

const closeTzKeepAz = planCloseHall({
  client,
  hall: 'tz',
  reasonInput: 'Ушёл с ТЗ',
  memberships: [tzLive, azLive],
  lifecycleRows: [],
  asOf: '2026-08-21',
  nowIso: '2026-08-21T12:00:00.000Z',
})
ok(
  closeTzKeepAz.ok && closeTzKeepAz.clubArchiveEntered === false,
  'phase2: close TZ with live AZ — no club archive',
)

// --- critical matrix phase2 + errors ---
console.log('\n--- critical matrix phase2 + errors ---')

const asOf = '2026-08-21'
const nowIso = '2026-08-21T15:00:00.000Z'
const reasonLeft = 'Не ходит / пропал'

// B1: unknown hall
ok(
  planCloseHall({
    client,
    hall: 'xx',
    reasonInput: reasonLeft,
    memberships: [tzLive],
    asOf,
    nowIso,
  }).error === 'Неизвестный зал',
  'B1: close unknown hall',
)
ok(
  planReopenHall({ client, hall: 'xx', memberships: [tzLive], asOf, nowIso }).error ===
    'Неизвестный зал',
  'B1: reopen unknown hall',
)
ok(
  planEnsureOpenHallAfterMembership({
    client,
    hall: 'xx',
    memberships: [tzLive],
    asOf,
    nowIso,
  }).error === 'Неизвестный зал',
  'B1: ensure unknown hall',
)

// B2: missing id / club
ok(
  planCloseHall({
    client: { id: 'c1' },
    hall: 'tz',
    reasonInput: reasonLeft,
    memberships: [tzLive],
    asOf,
    nowIso,
  }).error === 'Клиент без id / клуба',
  'B2: close without club_id',
)
ok(
  planReopenHall({
    client: { club_id: 'club1' },
    hall: 'tz',
    memberships: [tzLive],
    asOf,
    nowIso,
  }).error === 'Клиент без id / клуба',
  'B2: reopen without id',
)
ok(
  planLeaveClub({
    client: { id: 'c1' },
    reasonInput: reasonLeft,
    memberships: [tzLive],
    asOf,
    nowIso,
  }).error === 'Клиент без id / клуба',
  'B2: leave without club_id',
)

// B4 / B5: return later reason
const laterNoDate = buildHallCloseFields({
  reason: 'Вернётся позже',
  expectedReturnOn: null,
})
ok(
  laterNoDate.ok === false && laterNoDate.error === 'Укажите, до когда ждать возврата',
  'B4: return later without date',
)
const laterWithDate = buildHallCloseFields({
  reason: 'Вернётся позже',
  expectedReturnOn: '2026-11-01',
})
ok(
  laterWithDate.ok === true && laterWithDate.expected_return_on === '2026-11-01',
  'B5: return later with date',
)

// B6: reopen TZ/AZ without live mem
ok(
  planReopenHall({
    client,
    hall: 'tz',
    memberships: [],
    lifecycleRows: [lifeTzClosed],
    asOf,
  }).error === 'Сначала оформите живой абонемент этого направления',
  'B6: reopen TZ needs live mem',
)
ok(
  planReopenHall({
    client,
    hall: 'az',
    memberships: [],
    lifecycleRows: [
      {
        id: 'l-az-c',
        client_id: 'c1',
        club_id: 'club1',
        hall: 'az',
        closed_at: '2026-08-01T00:00:00Z',
      },
    ],
    asOf,
  }).error === 'Сначала оформите живой абонемент этого направления',
  'B6: reopen AZ needs live mem',
)

// B7 / B8: menu guards
const archivedOnTz = { ...client, archived_at: '2026-08-01T00:00:00Z' }
ok(
  !shouldOfferAdminCloseHall({
    clientsTab: 'tz',
    client: archivedOnTz,
    memberships: [tzLive],
    lifecycleRows: [],
    asOf,
  }),
  'B7: no close TZ when club-archived',
)
ok(
  !shouldOfferAdminReopenHall({
    clientsTab: 'tz',
    client: archivedOnTz,
    memberships: [tzLive],
    lifecycleRows: [lifeTzClosed],
    asOf,
  }),
  'B7: no reopen TZ when club-archived',
)
ok(
  !shouldOfferAdminCloseHall({
    clientsTab: 'archive',
    client,
    memberships: [tzLive],
    lifecycleRows: [],
    asOf,
  }),
  'B8: no close on archive tab',
)
ok(
  !shouldOfferAdminReopenHall({
    clientsTab: 'archive',
    client,
    memberships: [tzLive],
    lifecycleRows: [lifeTzClosed],
    asOf,
  }),
  'B8: no reopen on archive tab',
)

// A1: close only TZ → club archive
const closeOnlyTz = planCloseHall({
  client,
  hall: 'tz',
  reasonInput: reasonLeft,
  memberships: [tzLive],
  lifecycleRows: [],
  asOf,
  nowIso,
})
ok(
  closeOnlyTz.ok && closeOnlyTz.clubArchiveEntered === true && closeOnlyTz.clientPatch?.archived_at,
  'A1: only TZ → club archive',
)

// A2: close only AZ → club archive
const closeOnlyAz = planCloseHall({
  client,
  hall: 'az',
  reasonInput: reasonLeft,
  memberships: [azLive],
  lifecycleRows: [],
  asOf,
  nowIso,
})
ok(
  closeOnlyAz.ok && closeOnlyAz.clubArchiveEntered === true && closeOnlyAz.clientPatch?.archived_at,
  'A2: only AZ → club archive',
)

// A3: close TZ with live PZ — no archive; PZ stays live; TZ mem ended
const closeTzKeepPz = planCloseHall({
  client,
  hall: 'tz',
  reasonInput: 'Перешёл в ПЗ',
  memberships: [pzMem, tzLive],
  lifecycleRows: [],
  asOf,
  nowIso,
})
ok(closeTzKeepPz.ok && closeTzKeepPz.clubArchiveEntered === false, 'A3: close TZ + live PZ — no archive')
const afterCloseTzKeepPz = applyMembershipPatches([pzMem, tzLive], closeTzKeepPz.membershipPatches)
ok(hasLiveMembershipForHall(afterCloseTzKeepPz, 'pz', asOf, client), 'A3: PZ still live')
ok(!hasLiveMembershipForHall(afterCloseTzKeepPz, 'tz', asOf, client), 'A3: TZ mem ended')

// A4: close AZ with live TZ — no archive (A4 variant; TZ+AZ already above)
const closeAzKeepTz = planCloseHall({
  client,
  hall: 'az',
  reasonInput: 'Ушёл с АЗ',
  memberships: [tzLive, azLive],
  lifecycleRows: [],
  asOf,
  nowIso,
})
ok(closeAzKeepTz.ok && closeAzKeepTz.clubArchiveEntered === false, 'A4: close AZ + live TZ — no archive')

// A5: close AZ last open (PZ already closed)
const lifePzClosed = {
  id: 'l-pz-a5',
  client_id: 'c1',
  club_id: 'club1',
  hall: 'pz',
  closed_at: '2026-08-01T00:00:00Z',
}
const closeAzLast = planCloseHall({
  client,
  hall: 'az',
  reasonInput: reasonLeft,
  memberships: [{ ...pzMem, end_date: '2026-07-01' }, azLive],
  lifecycleRows: [lifePzClosed],
  asOf,
  nowIso,
})
ok(
  closeAzLast.ok && closeAzLast.clubArchiveEntered === true && closeAzLast.clientPatch?.archived_at,
  'A5: close last AZ (PZ already closed) → club archive',
)

// A6: TZ/AZ close do not burn PZ loyalty
ok(closeOnlyTz.burnsLoyaltyPz === false, 'A6: close only TZ — no loyalty burn')
ok(closeOnlyAz.burnsLoyaltyPz === false, 'A6: close only AZ — no loyalty burn')
ok(closeTzKeepPz.burnsLoyaltyPz === false, 'A6: close TZ with PZ — no loyalty burn')
ok(closeAzKeepTz.burnsLoyaltyPz === false, 'A6: close AZ with TZ — no loyalty burn')

// A7: reopen AZ after close+archive + new live AZ
const azNewAfterArchive = {
  ...azLive,
  id: 'm-az-new',
  start_date: '2026-08-21',
  end_date: '2026-11-21',
}
const reopenAzFromArchive = planReopenHall({
  client: { ...client, archived_at: closeOnlyAz.clientPatch.archived_at },
  hall: 'az',
  memberships: [azNewAfterArchive],
  lifecycleRows: [closeOnlyAz.lifecycleRow],
  asOf,
  nowIso: '2026-08-21T16:00:00.000Z',
})
ok(
  reopenAzFromArchive.ok &&
    reopenAzFromArchive.lifecycleRow?.closed_at == null &&
    reopenAzFromArchive.clientPatch?.archived_at == null,
  'A7: reopen AZ from club archive restores client',
)

// A8: reopen TZ after close without club archive
const reopenTzOnly = planReopenHall({
  client,
  hall: 'tz',
  memberships: [tzLive],
  lifecycleRows: [closeTzKeepPz.lifecycleRow],
  asOf,
  nowIso: '2026-08-21T16:30:00.000Z',
})
ok(
  reopenTzOnly.ok &&
    reopenTzOnly.lifecycleRow?.closed_at == null &&
    reopenTzOnly.clientPatch == null,
  'A8: reopen TZ without archive — lifecycle only',
)

// C: close AZ must not patch live PZ membership
ok(
  !(closeAzKeepTz.membershipPatches ?? []).some((m) => String(m.id) === String(pzMem.id)),
  'C: close AZ does not patch PZ mem',
)
ok(
  (closeAzKeepTz.membershipPatches ?? []).every((m) => String(m.hall ?? '') === 'az' || String(m.id) === 'm-az2'),
  'C: close AZ patches only AZ mem',
)
const afterCloseAzKeepTz = applyMembershipPatches([tzLive, azLive], closeAzKeepTz.membershipPatches)
ok(hasLiveMembershipForHall(afterCloseAzKeepTz, 'tz', asOf, client), 'C: TZ still live after AZ close')
ok(!hasLiveMembershipForHall(afterCloseAzKeepTz, 'az', asOf, client), 'C: AZ mem ended after close')

// D: pull-guard required for lifecycle (already asserted above — keep explicit matrix tag)
ok(isPullMergeGuardedStore('client_hall_lifecycle'), 'D: pull-guard matrix — lifecycle guarded')

// --- E: fill form → check ready → planCloseHall ---
console.log('\n--- form fill + check → close ---')

ok(!isArchiveReasonModalReady({}), 'E: empty form not ready')
ok(
  buildArchiveReasonConfirmPayload({}).ok === false,
  'E: empty form no confirm payload',
)
ok(
  !isArchiveReasonModalReady({ chipId: 'other', customText: '' }),
  'E: other without text not ready',
)
ok(
  buildArchiveReasonConfirmPayload({ chipId: 'other', customText: '' }).ok === false,
  'E: other empty — no submit',
)

const formChip = buildArchiveReasonConfirmPayload({ chipId: 'no_show' })
ok(formChip.ok && formChip.payload.reason === 'Не ходит / пропал', 'E: fill chip → payload')
const closeFromFormTz = planCloseHall({
  client,
  hall: 'tz',
  reasonInput: formChip.payload,
  memberships: [tzLive],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T17:00:00.000Z',
})
ok(
  closeFromFormTz.ok && closeFromFormTz.lifecycleRow?.close_reason === 'Не ходит / пропал',
  'E: chip form → close TZ',
)

const formOther = buildArchiveReasonConfirmPayload({
  chipId: 'other',
  customText: '  Временно уехал  ',
})
ok(formOther.ok && formOther.payload.reason === 'Временно уехал', 'E: fill other → check')
const closeFromFormAz = planCloseHall({
  client,
  hall: 'az',
  reasonInput: formOther.payload,
  memberships: [azLive, tzLive],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T17:10:00.000Z',
})
ok(
  closeFromFormAz.ok &&
    closeFromFormAz.clubArchiveEntered === false &&
    closeFromFormAz.lifecycleRow?.close_reason === 'Временно уехал',
  'E: other form → close AZ keep TZ',
)

ok(
  buildArchiveReasonConfirmPayload({
    chipId: 'return_later',
    expectedReturnOn: null,
  }).ok === false,
  'E: return_later without date — check fails',
)
const formLater = buildArchiveReasonConfirmPayload({
  chipId: 'return_later',
  expectedReturnOn: '2026-12-01',
})
ok(
  formLater.ok &&
    formLater.payload.expectedReturnOn === '2026-12-01' &&
    String(formLater.payload.reason).includes('Вернётся позже'),
  'E: return_later filled + checked',
)
const closeFromLater = planCloseHall({
  client,
  hall: 'pz',
  reasonInput: formLater.payload,
  memberships: [pzMem, tzLive],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T17:20:00.000Z',
})
ok(
  closeFromLater.ok &&
    closeFromLater.lifecycleRow?.expected_return_on === '2026-12-01' &&
    closeFromLater.clubArchiveEntered === false,
  'E: return_later form → close PZ keep TZ',
)

const leaveFromForm = planLeaveClub({
  client,
  reasonInput: formChip.payload,
  memberships: [pzMem, tzLive],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T17:30:00.000Z',
})
ok(leaveFromForm.ok && leaveFromForm.clientPatch?.archived_at, 'E: chip form → leave club')

// --- F: non-standard / edge scenarios ---
console.log('\n--- F non-standard scenarios ---')

const pnkClient = { ...client, lifecycle: 'pnk' }
const closePnkOnlyTz = planCloseHall({
  client: pnkClient,
  hall: 'tz',
  reasonInput: reasonLeft,
  memberships: [tzLive],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T18:00:00.000Z',
})
ok(
  closePnkOnlyTz.ok && closePnkOnlyTz.clubArchiveEntered === false,
  'F1: PNK + close only TZ — no club archive',
)

const depletedAzOnly = {
  id: 'm-az-dep2',
  client_id: 'c1',
  hall: 'az',
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  total_trainings: 8,
  used_trainings: 8,
}
const closePzDepletedAz = planCloseHall({
  client,
  hall: 'pz',
  reasonInput: reasonLeft,
  memberships: [pzMem, depletedAzOnly],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T18:05:00.000Z',
})
ok(
  closePzDepletedAz.ok && closePzDepletedAz.clubArchiveEntered === true,
  'F2: close PZ + depleted AZ only → club archive',
)

const upcomingAzF = {
  id: 'm-az-up-f',
  client_id: 'c1',
  hall: 'az',
  start_date: '2026-09-01',
  end_date: '2026-12-01',
  total_trainings: 0,
  used_trainings: 0,
}
const closeTzUpcomingAz = planCloseHall({
  client,
  hall: 'tz',
  reasonInput: 'Ушёл с ТЗ',
  memberships: [tzLive, upcomingAzF],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T18:10:00.000Z',
})
ok(
  closeTzUpcomingAz.ok && closeTzUpcomingAz.clubArchiveEntered === false,
  'F3: close TZ + upcoming AZ — no archive',
)

const expiredTzEver = {
  id: 'm-tz-ex',
  client_id: 'c1',
  hall: 'tz',
  start_date: '2025-01-01',
  end_date: '2025-06-01',
  total_trainings: 0,
  used_trainings: 0,
}
const closePzAutoTz = planCloseHall({
  client,
  hall: 'pz',
  reasonInput: reasonLeft,
  memberships: [pzMem, expiredTzEver],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T18:15:00.000Z',
})
ok(
  (closePzAutoTz.autoLifecycleRows ?? []).some(
    (r) => r.hall === 'tz' && r.close_reason === 'Закончился абонемент',
  ),
  'F4: close PZ auto-closes expired TZ hall',
)
ok(
  buildAutoCloseHallsWithoutLiveMembership({
    client,
    memberships: [expiredTzEver],
    lifecycleRows: [],
    asOf,
    nowIso: '2026-08-21T18:15:00.000Z',
  }).some((r) => r.hall === 'tz'),
  'F4: auto-close helper marks TZ',
)

const foreignLife = {
  id: 'l-other',
  client_id: 'c-OTHER',
  club_id: 'club1',
  hall: 'tz',
  closed_at: '2026-08-01T00:00:00Z',
}
ok(
  isHallOpen({
    client,
    memberships: [tzLive],
    lifecycleRows: [foreignLife],
    hall: 'tz',
    asOf,
  }) === true,
  'F5: foreign client_id lifecycle ignored',
)
const closeIgnoreForeign = planCloseHall({
  client,
  hall: 'tz',
  reasonInput: reasonLeft,
  memberships: [tzLive, azLive],
  lifecycleRows: [foreignLife],
  asOf,
  nowIso: '2026-08-21T18:20:00.000Z',
})
ok(
  closeIgnoreForeign.ok &&
    closeIgnoreForeign.lifecycleRow?.client_id === 'c1' &&
    closeIgnoreForeign.clubArchiveEntered === false,
  'F5: close uses own client_id only',
)

const closeLaterPz = planCloseHall({
  client,
  hall: 'pz',
  reasonInput: { reason: 'Вернётся позже', expectedReturnOn: '2026-12-15' },
  memberships: [pzMem, tzLive],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T18:25:00.000Z',
})
ok(closeLaterPz.lifecycleRow?.expected_return_on === '2026-12-15', 'F6: close stores return date')
const reopenClearsReturn = planReopenHall({
  client,
  hall: 'pz',
  memberships: [
    ...applyMembershipPatches([pzMem, tzLive], closeLaterPz.membershipPatches),
    {
      ...pzMem,
      id: 'm-pz-re',
      start_date: '2026-08-21',
      end_date: '2026-11-21',
      used_trainings: 0,
    },
  ],
  lifecycleRows: [closeLaterPz.lifecycleRow],
  asOf,
  nowIso: '2026-08-21T18:26:00.000Z',
})
ok(
  reopenClearsReturn.ok &&
    reopenClearsReturn.lifecycleRow?.closed_at == null &&
    reopenClearsReturn.lifecycleRow?.expected_return_on == null &&
    reopenClearsReturn.lifecycleRow?.close_reason == null,
  'F6: reopen clears return/reason',
)

const alreadyClosedTz = {
  id: 'l-tz-dup',
  client_id: 'c1',
  club_id: 'club1',
  hall: 'tz',
  closed_at: '2026-08-01T00:00:00Z',
  close_reason: 'Старое',
}
const recloseTz = planCloseHall({
  client,
  hall: 'tz',
  reasonInput: 'Повторное закрытие',
  memberships: [tzLive, azLive],
  lifecycleRows: [alreadyClosedTz],
  asOf,
  nowIso: '2026-08-21T18:30:00.000Z',
})
ok(
  recloseTz.ok &&
    recloseTz.clubArchiveEntered === false &&
    recloseTz.lifecycleRow?.close_reason === 'Повторное закрытие',
  'F7: re-close already closed TZ ok',
)

const closeCyrillic = planCloseHall({
  client,
  hall: 'ТЗ',
  reasonInput: reasonLeft,
  memberships: [tzLive, azLive],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T18:35:00.000Z',
})
ok(closeCyrillic.ok && closeCyrillic.hall === 'tz', 'F8: hall ТЗ normalizes to tz')

const closeAlreadyArchived = planCloseHall({
  client: { ...client, archived_at: '2026-08-01T00:00:00Z' },
  hall: 'az',
  reasonInput: reasonLeft,
  memberships: [azLive],
  lifecycleRows: [],
  asOf,
  nowIso: '2026-08-21T18:40:00.000Z',
})
ok(
  closeAlreadyArchived.ok && closeAlreadyArchived.clientPatch == null,
  'F9: already archived — no second archive patch',
)

const upcomingTzMem = {
  id: 'm-tz-up',
  client_id: 'c1',
  hall: 'tz',
  start_date: '2026-09-15',
  end_date: '2026-12-15',
  total_trainings: 12,
  used_trainings: 0,
}
ok(
  shouldOfferAdminReopenHall({
    clientsTab: 'tz',
    client,
    memberships: [upcomingTzMem],
    lifecycleRows: [lifeTzClosed],
    asOf,
  }),
  'F10: offer reopen TZ when closed + upcoming mem',
)

// --- G: dual-device / pending missing (где может сломаться Sync) ---
console.log('\n--- G dual-device / pending ---')

const lifeId = 'life-tz-device-a'
const localClosed = {
  id: lifeId,
  client_id: 'c1',
  club_id: 'club1',
  hall: 'tz',
  closed_at: '2026-08-21T18:00:00.000Z',
  close_reason: 'Ушёл с ТЗ',
}
const remoteStaleOpen = {
  id: lifeId,
  client_id: 'c1',
  club_id: 'club1',
  hall: 'tz',
  closed_at: null,
  close_reason: null,
}
const pendingWithClose = { client_hall_lifecycle: new Set([lifeId]) }
const pendingEmpty = { client_hall_lifecycle: new Set() }
const pendingOtherRow = { client_hall_lifecycle: new Set(['life-OTHER']) }

ok(
  cloudPutAllowedOnPull('client_hall_lifecycle', lifeId, pendingWithClose) === false,
  'G1: pending close — pull cannot overwrite local',
)
ok(
  shouldPreserveLocalRowOnPull(pendingWithClose.client_hall_lifecycle, lifeId, true) === true,
  'G1: preserve local closed while pending',
)
ok(
  isHallOpen({
    client,
    memberships: [tzLive],
    lifecycleRows: [localClosed],
    hall: 'tz',
    asOf,
  }) === false,
  'G1: device A sees TZ closed',
)

ok(
  cloudPutAllowedOnPull('client_hall_lifecycle', lifeId, pendingEmpty) === true,
  'G2: NO pending — stale remote CAN overwrite (risk)',
)
ok(
  shouldPreserveLocalRowOnPull(pendingEmpty.client_hall_lifecycle, lifeId, true) === false,
  'G2: without pending local not preserved on pull',
)
ok(
  isHallOpen({
    client,
    memberships: [tzLive],
    lifecycleRows: [remoteStaleOpen],
    hall: 'tz',
    asOf,
  }) === true,
  'G2: after overwrite by stale open — TZ looks open again (breakage)',
)

ok(
  cloudPutAllowedOnPull('client_hall_lifecycle', lifeId, pendingOtherRow) === true,
  'G3: pending other id does not protect this row',
)

const deviceBClosedLater = planCloseHall({
  client,
  hall: 'tz',
  reasonInput: 'Закрыл на втором планшете',
  memberships: [tzLive, azLive],
  lifecycleRows: [remoteStaleOpen],
  asOf,
  nowIso: '2026-08-21T19:00:00.000Z',
})
ok(deviceBClosedLater.ok && deviceBClosedLater.lifecycleRow?.id, 'G4: device B can close from stale open')
const idB = String(deviceBClosedLater.lifecycleRow.id)
ok(
  cloudPutAllowedOnPull('client_hall_lifecycle', idB, {
    client_hall_lifecycle: new Set([idB]),
  }) === false,
  'G4: after close on B, pending protects until flush',
)

const closeThenClientPending = {
  clients: new Set(['c1']),
  client_hall_lifecycle: new Set([lifeId]),
}
ok(
  cloudPutAllowedOnPull('clients', 'c1', closeThenClientPending) === false,
  'G5: pending client archive patch also guarded',
)
ok(
  cloudPutAllowedOnPull('client_hall_lifecycle', lifeId, closeThenClientPending) === false,
  'G5: lifecycle + client pending together',
)

ok(
  cloudPutAllowedOnPull('client_hall_lifecycle', '', pendingWithClose) === true,
  'G6: empty record key — put allowed (no false block)',
)
ok(
  cloudPutAllowedOnPull('exercises', lifeId, pendingWithClose) === true,
  'G6: non-guarded store ignores lifecycle pending',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-client-hall-lifecycle: ok')
