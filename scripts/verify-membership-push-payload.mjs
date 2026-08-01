import { normalizeMembershipPushPayload } from '../src/lib/membershipPushPayload.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const insertOk = normalizeMembershipPushPayload(
  {
    id: 'm1',
    client_id: 'c1',
    club_id: 'cl1',
    start_date: '2026-07-01',
    end_date: '2026-08-01',
    total_trainings: 8,
    used_trainings: 0,
  },
  { insert: true },
)
ok(insertOk.ok && insertOk.data.start_date === '2026-07-01', 'insert keeps valid dates')

const insertBad = normalizeMembershipPushPayload(
  { id: 'm2', client_id: 'c1', club_id: 'cl1', start_date: null, end_date: '2026-08-01' },
  { insert: true },
)
ok(!insertBad.ok && /начала/i.test(insertBad.error), 'insert rejects null start_date')

const updateStrip = normalizeMembershipPushPayload({
  id: 'm3',
  used_trainings: 3,
  start_date: null,
  end_date: '',
  total_trainings: 8,
})
ok(updateStrip.ok, 'update with null dates ok')
ok(!Object.prototype.hasOwnProperty.call(updateStrip.data, 'start_date'), 'update omits null start_date')
ok(!Object.prototype.hasOwnProperty.call(updateStrip.data, 'end_date'), 'update omits empty end_date')
ok(updateStrip.data.used_trainings === 3, 'update keeps used_trainings')

const updateKeep = normalizeMembershipPushPayload({
  id: 'm4',
  start_date: '2026-07-10',
  end_date: '2026-08-10',
  used_trainings: 1,
})
ok(
  updateKeep.ok && updateKeep.data.start_date === '2026-07-10' && updateKeep.data.end_date === '2026-08-10',
  'update keeps valid dates',
)

const badOrder = normalizeMembershipPushPayload(
  {
    id: 'm5',
    client_id: 'c1',
    club_id: 'cl1',
    start_date: '2026-08-01',
    end_date: '2026-07-01',
    total_trainings: 8,
  },
  { insert: true },
)
ok(!badOrder.ok && /раньше начала/i.test(badOrder.error), 'insert rejects end before start')

const paidOk = normalizeMembershipPushPayload({
  id: 'm6',
  used_trainings: 0,
  paid_amount: '12 500,50',
})
ok(paidOk.ok && paidOk.data.paid_amount === 12500.5, 'paid_amount parsed')

const paidNull = normalizeMembershipPushPayload({ id: 'm7', paid_amount: '' })
ok(paidNull.ok && paidNull.data.paid_amount === null, 'empty paid_amount -> null')

const paidBad = normalizeMembershipPushPayload({ id: 'm8', paid_amount: -1 })
ok(!paidBad.ok, 'rejects negative paid_amount')

const stripUpdated = normalizeMembershipPushPayload(
  {
    id: 'm9',
    client_id: 'c1',
    club_id: 'cl1',
    start_date: '2026-07-01',
    end_date: '2026-08-01',
    total_trainings: 0,
    updated_at: '2026-08-01T12:00:00.000Z',
  },
  { insert: true },
)
ok(stripUpdated.ok && !('updated_at' in stripUpdated.data), 'strips updated_at (not in DB)')

console.log('verify-membership-push-payload: all passed')
