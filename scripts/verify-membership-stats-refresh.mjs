/**
 * Сценарий «устаревший абонемент в IDB → не активные; после обновления — активный».
 */
import { aggregateClubClientPeriod } from '../src/lib/admin/clubClientPeriodAgg.js'
import { hasUsableMembershipOnDate } from '../src/lib/membershipRules.js'
import { todayLocalIso } from '../src/lib/dateRu.js'

let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = todayLocalIso()
const client = { id: 'c1', name: 'Абаева Светлана' }

const staleMemberships = [
  { client_id: 'c1', start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 12, used_trainings: 12 },
]

const freshMemberships = [
  { client_id: 'c1', start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 12, used_trainings: 3 },
]

const from = today.slice(0, 8) + '01-01'
const to = today

const staleAgg = aggregateClubClientPeriod([client], staleMemberships, from, to, today)
ok(staleAgg.inactiveInPeriod === 1, 'depleted membership → inactive')

const freshAgg = aggregateClubClientPeriod([client], freshMemberships, from, to, today)
ok(freshAgg.inactiveInPeriod === 0, 'remaining trainings → not inactive')
ok(hasUsableMembershipOnDate(freshMemberships, today), 'usable on today')

if (failed) process.exit(1)
console.log('verify-membership-stats-refresh: all passed')
