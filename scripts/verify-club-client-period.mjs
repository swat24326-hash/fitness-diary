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
]

const r = aggregateClubClientPeriod(clients, memberships, '2026-05-01', '2026-05-31')

ok(r.totalClients === 3, 'total clients')
ok(r.activeWithMembership === 1, 'c3 active on end of may')
ok(r.notRenewedInPeriod === 1, 'only c1 ended in may without renewal')
ok(r.notRenewedClients.length === 1 && r.notRenewedClients[0].id === 'c1', 'not renewed list')
ok(r.notRenewedClients[0].name === 'Иванов', 'name in list')
ok(r.notRenewedClients[0].membershipEnded === '2026-05-15', 'end date')

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll club-client-period checks passed.')
