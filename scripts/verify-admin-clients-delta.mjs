/**
 * node scripts/verify-admin-clients-delta.mjs — A2 merge/prune/watermark (CAPACITY_PLAN).
 */
import {
  adminClientsDeltaPrunePlan,
  adminClientsPullWatermarkKey,
  canPruneAdminClientsFromIds,
  canPruneAdminMembershipsFromIds,
  nextAdminClientsWatermark,
  remoteClientsForReconcile,
  shouldUseAdminClientsDelta,
} from '../src/lib/admin/adminClientsDeltaCore.js'
import {
  membershipIdsToPruneByRemoteIds,
  membershipIdsToPruneForClients,
} from '../src/lib/clientMembershipsPrune.js'
import {
  LIST_CLIENTS_SELECT,
  LIST_MEMBERSHIPS_SELECT,
  parseUpdatedSinceQuery,
} from '../api/_lib/adminClientsListSelectCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(adminClientsPullWatermarkKey('club-1') === 'admin_clients_pull_at:club-1', 'ключ watermark по клубу')
ok(!shouldUseAdminClientsDelta(null), 'нет watermark → полный pull')
ok(!shouldUseAdminClientsDelta('не дата'), 'мусор watermark → полный pull')
ok(shouldUseAdminClientsDelta('2026-11-14T10:00:00.000Z'), 'ISO watermark → delta')

ok(canPruneAdminClientsFromIds({ truncated: true, clientIds: ['a'] }) === false, 'truncated → не prune клиентов')
ok(canPruneAdminClientsFromIds({ clientIds: ['a', 'b'] }) === true, 'полный client_ids → prune клиентов')
ok(canPruneAdminClientsFromIds({ clientIds: null }) === false, 'нет client_ids → не prune')

ok(
  canPruneAdminMembershipsFromIds({ truncated: false, membershipIds: ['m1'], isDelta: true }) === true,
  'delta + membership_ids → prune абонов',
)
ok(
  canPruneAdminMembershipsFromIds({ truncated: false, isDelta: true }) === false,
  'delta без membership_ids → не prune абонов',
)
ok(
  canPruneAdminMembershipsFromIds({ truncated: true, membershipIds: ['m1'] }) === false,
  'truncated → не prune абонов',
)

const plan = adminClientsDeltaPrunePlan({
  truncated: false,
  clientIds: ['c1'],
  membershipIds: ['m1', 'm2'],
  isDelta: true,
})
ok(plan.pruneClients && plan.pruneMemberships, 'план prune на полной дельте')
ok(plan.clientIdsForPrune[0] === 'c1' && plan.membershipIdsForPrune.length === 2, 'id для prune')

const stubs = remoteClientsForReconcile(['a', 'b'], [{ id: 'x' }])
ok(stubs.length === 2 && stubs[0].id === 'a', 'reconcile stubs из client_ids')
ok(remoteClientsForReconcile(null, [{ id: 'x' }])[0].id === 'x', 'fallback rows без client_ids')

ok(
  nextAdminClientsWatermark({ ok: true, serverTime: '2026-11-14T12:00:00.000Z' }) ===
    '2026-11-14T12:00:00.000Z',
  'bump watermark после успеха',
)
ok(
  nextAdminClientsWatermark({ ok: false, previous: '2026-11-14T11:00:00.000Z' }) ===
    '2026-11-14T11:00:00.000Z',
  'ошибка — watermark не сбрасываем',
)
ok(nextAdminClientsWatermark({ ok: true, serverTime: 'bad' }) === null, 'битый server_time → null')

const localMem = [
  { id: 'keep', client_id: 'c1', synced: true },
  { id: 'gone', client_id: 'c1', synced: true, updated_at: '2020-01-01T00:00:00.000Z' },
  { id: 'other', client_id: 'c2', synced: true, updated_at: '2020-01-01T00:00:00.000Z' },
]
const byIds = membershipIdsToPruneByRemoteIds(
  ['c1'],
  localMem,
  ['keep'],
  null,
  { nowMs: Date.parse('2026-11-14T12:00:00.000Z'), graceMs: 0 },
)
ok(byIds.length === 1 && byIds[0] === 'gone', 'prune by membership_ids убирает отсутствующий id')

const dangerous = membershipIdsToPruneForClients(
  ['c1'],
  localMem,
  [{ id: 'keep' }], // без client_id — как ошибочная дельта строками
  null,
  { nowMs: Date.parse('2026-11-14T12:00:00.000Z'), graceMs: 0 },
)
ok(
  dangerous.includes('keep') && dangerous.includes('gone'),
  'неполный remote без client_id опасен — поэтому delta prune только по membership_ids',
)

const sinceOk = parseUpdatedSinceQuery('2026-11-14T10:00:00.000Z')
ok(sinceOk.ok && sinceOk.since.startsWith('2026-11-14'), 'parse updated_since ISO')
ok(parseUpdatedSinceQuery('').ok && parseUpdatedSinceQuery('').since === null, 'пустой updated_since')
ok(!parseUpdatedSinceQuery('вчера').ok, 'битый updated_since → ошибка')

ok(LIST_CLIENTS_SELECT.includes('updated_at') && !LIST_CLIENTS_SELECT.includes('*'), 'узкий select клиентов')
ok(
  LIST_MEMBERSHIPS_SELECT.includes('session_visits') && LIST_MEMBERSHIPS_SELECT.includes('updated_at'),
  'узкий select абонов',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nverify-admin-clients-delta: all passed')
