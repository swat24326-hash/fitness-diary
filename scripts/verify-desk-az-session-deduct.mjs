/**
 * node scripts/verify-desk-az-session-deduct.mjs
 */
import {
  aggregateDeskAzSessionsForDay,
  applyDeskAzSessionDeduct,
  applyDeskAzSessionVisitDateChange,
  applyDeskAzSessionVisitRemove,
  canDeductDeskAzSession,
  countUnaccountedAzSessionSlots,
  deskAzSessionUsage,
  fillEmptyAerobicMatrixFromAzSessions,
  formatDeskAzSessionUsageRu,
  mergeAerobicMatrixWithAzSessionCounts,
  normalizeSessionVisits,
  resolveDeskAzDeductDate,
} from '../src/lib/admin/deskAzSessionDeductCore.js'
import { normalizeMembershipPushPayload } from '../src/lib/membershipPushPayload.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const base = {
  id: 'm1',
  client_id: 'c1',
  start_date: '2026-08-01',
  end_date: '2026-08-31',
  total_trainings: 10,
  used_trainings: 0,
  session_visits: [],
  membership_type_id: 'box',
}

ok(canDeductDeskAzSession(base, '2026-08-04').ok, 'can deduct')
ok(resolveDeskAzDeductDate(base, '2026-08-04') === '2026-08-04', 'date today')
ok(resolveDeskAzDeductDate(base, '2026-09-10') === '2026-08-31', 'clamp to end')
ok(
  !canDeductDeskAzSession({ ...base, membership_type_id: '' }, '2026-08-04').ok,
  'no direction blocked',
)

const d1 = applyDeskAzSessionDeduct(base, {
  date: '2026-08-04',
  visitId: 'v1',
  nowIso: '2026-08-04T10:00:00.000Z',
})
ok(d1.ok && d1.membership.used_trainings === 1, 'deduct used')
ok(d1.membership.session_visits[0]?.membership_type_id === 'box', 'visit keeps type')
ok(d1.membership.session_visits.length === 1 && d1.membership.session_visits[0].date === '2026-08-04', 'visit stored')

const d2 = applyDeskAzSessionDeduct(d1.membership, {
  date: '2026-08-05',
  visitId: 'v2',
  nowIso: '2026-08-05T10:00:00.000Z',
})
ok(d2.ok && d2.membership.used_trainings === 2, 'second deduct')

const moved = applyDeskAzSessionVisitDateChange(d2.membership, 'v1', '2026-08-06')
ok(moved.ok && moved.membership.session_visits.find((v) => v.id === 'v1')?.date === '2026-08-06', 'change date')
ok(
  moved.membership.session_visits.find((v) => v.id === 'v1')?.membership_type_id === 'box',
  'type preserved on date change',
)

const removed = applyDeskAzSessionVisitRemove(moved.membership, 'v2')
ok(removed.ok && removed.membership.used_trainings === 1, 'remove restores used')
ok(removed.membership.session_visits.length === 1, 'one visit left')

const full = {
  ...base,
  used_trainings: 10,
  session_visits: Array.from({ length: 10 }, (_, i) => ({
    id: `x${i}`,
    date: '2026-08-04',
    created_at: '2026-08-04T10:00:00.000Z',
    membership_type_id: 'box',
  })),
}
ok(!canDeductDeskAzSession(full, '2026-08-04').ok, 'depleted blocked')

ok(formatDeskAzSessionUsageRu(d1.membership) === '1 из 10', 'usage label')
ok(deskAzSessionUsage({ used_trainings: 3, session_visits: [], total_trainings: 8 }).undatedUsed === 3, 'undated')

const clients = [{ id: 'c1', desk_hall: 'az' }, { id: 'c2', desk_hall: 'tz' }]
const mems = [
  {
    client_id: 'c1',
    membership_type_id: 'step', // текущее направление сменили
    session_visits: [
      { id: 'a', date: '2026-08-04', created_at: 't', membership_type_id: 'box' },
      { id: 'b', date: '2026-08-04', created_at: 't', membership_type_id: 'box' },
      { id: 'c', date: '2026-08-05', created_at: 't', membership_type_id: 'step' },
    ],
  },
]
const dayAgg = aggregateDeskAzSessionsForDay(mems, clients, '2026-08-04')
ok(dayAgg.length === 1 && dayAgg[0].count === 2 && dayAgg[0].membership_type_id === 'box', 'day agg uses visit type')

const merged = mergeAerobicMatrixWithAzSessionCounts({ box: '1' }, dayAgg)
ok(merged.box === '2', 'merge max')

const emptyFill = fillEmptyAerobicMatrixFromAzSessions({ box: '5', step: '' }, [
  { membership_type_id: 'box', count: 2 },
  { membership_type_id: 'step', count: 3 },
])
ok(emptyFill.matrix.box === '5', 'fill empty keeps manual')
ok(emptyFill.matrix.step === '3' && emptyFill.filledCells === 1, 'fill empty only empty')

ok(countUnaccountedAzSessionSlots({ box: '1' }, dayAgg) === 1, 'unaccounted slots')

const push = normalizeMembershipPushPayload({
  id: 'm1',
  used_trainings: 1,
  session_visits: [{ id: 'v1', date: '2026-08-04', created_at: 't', membership_type_id: 'box' }],
})
ok(push.ok && push.data.session_visits[0].membership_type_id === 'box', 'push keeps visit type')

ok(normalizeSessionVisits([{ id: 'bad' }]).length === 0, 'bad visit dropped')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll desk-az-session-deduct checks passed')
