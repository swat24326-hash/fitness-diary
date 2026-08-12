/**
 * node scripts/verify-trainer-clients-browse-filters.mjs
 */
import {
  buildTrainerClientsBrowseCounts,
  clientMatchesTrainerBrowseFilter,
  verifyTrainerClientsBrowseChipParity,
} from '../src/lib/trainer/trainerClientsBrowseFilterCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const today = '2026-07-22'
const clients = [
  { id: 'b', birth_date: '1990-07-22' },
  { id: 'soon', birth_date: '1990-08-01' },
  { id: 'e', birth_date: '1990-01-01' },
  { id: 'p', birth_date: '1990-01-01', lifecycle: 'pnk' },
  { id: 'n', birth_date: '1990-01-01' },
]
const memByClient = {
  b: [{ start_date: '2026-01-01', end_date: '2026-12-01', total_trainings: 10, used_trainings: 1 }],
  soon: [{ start_date: '2026-01-01', end_date: '2026-12-01', total_trainings: 10, used_trainings: 1 }],
  e: [{ start_date: '2026-01-01', end_date: '2026-07-24', total_trainings: 10, used_trainings: 1 }],
  p: [{ start_date: '2026-07-01', end_date: '2026-08-31', total_trainings: 1, used_trainings: 1 }],
  n: [],
}

const counts = buildTrainerClientsBrowseCounts(clients, memByClient, today)
ok(counts.all === 5, 'all = roster length')
ok(counts.birthdays === 1, 'birthdays chip = today only')
ok(
  clientMatchesTrainerBrowseFilter(clients[1], 'birthdays', memByClient.soon, today),
  'list includes soon in birthday window',
)
ok(counts.expiring === 1, 'expiring')
ok(counts.pnk === 1, 'pnk')
ok(counts.inactive === 1, 'inactive empty mem')
ok(
  !clientMatchesTrainerBrowseFilter(
    { id: 'p', lifecycle: 'pnk' },
    'expired_recent',
    memByClient.p,
    today,
  ),
  'open PNK not in expired_recent',
)

const parity = verifyTrainerClientsBrowseChipParity(clients, memByClient, today)
ok(parity.ok, `chip=list parity: ${JSON.stringify(parity.mismatches)}`)

if (failed) process.exit(1)
console.log('verify-trainer-clients-browse-filters: all passed')
