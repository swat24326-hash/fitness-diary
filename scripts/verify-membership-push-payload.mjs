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

console.log('verify-membership-push-payload: all passed')
