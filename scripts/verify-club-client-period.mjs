import { aggregateClubClientPeriod } from '../api/lib/clubStatsAgg.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const clients = [
  { id: 'c1', name: 'Иванов' },
  { id: 'c2', name: 'Петров' },
  { id: 'c3', name: 'Сидоров' },
  { id: 'c4', name: 'Лазутко' },
]

const memberships = [
  { client_id: 'c1', start_date: '2026-05-01', end_date: '2026-05-15', total_trainings: 12, used_trainings: 12 },
  { client_id: 'c2', start_date: '2026-05-01', end_date: '2026-06-15', total_trainings: 12, used_trainings: 3 },
  {
    client_id: 'c3',
    start_date: '2026-06-01',
    end_date: '2026-06-30',
    total_trainings: 12,
    used_trainings: 0,
  },
  { client_id: 'c4', start_date: '2026-05-01', end_date: '2026-06-30', total_trainings: 12, used_trainings: 12 },
]

const r = aggregateClubClientPeriod(clients, memberships, '2026-05-01', '2026-05-31')

ok(r.totalClients === 4, 'total clients')
ok(r.activeWithMembership === 1, 'c2 active on end of may')
ok(r.inactiveInPeriod === 3, 'c1 expired/depleted, c3 not started, c4 depleted')
ok(r.inactiveClients.length === 3, 'inactive list size')
ok(r.inactiveClients.some((c) => c.id === 'c1' && c.inactiveReason === 'expired'), 'c1 end in may -> expired on 31.05')
ok(r.inactiveClients.some((c) => c.id === 'c4' && c.inactiveReason === 'depleted'), 'c4 depleted but june end -> inactive')
ok(r.inactiveClients.some((c) => c.id === 'c3' && c.inactiveReason === 'not_started'), 'c3 not started')
ok(r.notRenewedInPeriod === 0, 'notRenewed deprecated empty')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll club-client-period checks passed.')
