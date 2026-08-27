/**
 * node scripts/verify-trainer-clients-pz-list.mjs
 * Список тренера Активные|Архив после close ПЗ при живом АЗ/ТЗ.
 */
import {
  isTrainerPzListActive,
  isTrainerPzListClosed,
  partitionTrainerClientsByPzLifecycle,
  trainerPzClosedBadgeLabelForClient,
} from '../src/lib/trainer/trainerClientsPzListCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const asOf = '2026-08-27'
const abaeva = {
  id: 'abaeva',
  name: 'Абаева Светлана',
  club_id: 'club1',
  trainer_id: 'kozhemyakina',
}
const liveClient = {
  id: 'live',
  name: 'Живой ПЗ',
  club_id: 'club1',
  trainer_id: 'kozhemyakina',
}
const clubArchived = {
  id: 'gone',
  name: 'Ушёл из клуба',
  club_id: 'club1',
  trainer_id: 'kozhemyakina',
  archived_at: '2026-08-01T10:00:00.000Z',
}

const lifeClosedPz = [
  {
    id: 'l-abaeva-pz',
    client_id: 'abaeva',
    club_id: 'club1',
    hall: 'pz',
    closed_at: '2026-08-26T12:00:00.000Z',
    close_reason: 'Перешёл в АЗ',
  },
]

ok(isTrainerPzListActive(abaeva, []), 'T1: без close — в Активных')
ok(!isTrainerPzListClosed(abaeva, []), 'T1: без close — не Архив')

ok(isTrainerPzListClosed(abaeva, lifeClosedPz), 'T2: close ПЗ — в Архиве тренера')
ok(!isTrainerPzListActive(abaeva, lifeClosedPz), 'T2: close ПЗ — не в Активных')

ok(isTrainerPzListClosed(clubArchived, []), 'T3: архив клуба — в Архиве')
ok(!isTrainerPzListActive(clubArchived, []), 'T3: архив клуба — не Активные')

const { activeClients, archivedClients } = partitionTrainerClientsByPzLifecycle(
  [abaeva, liveClient, clubArchived],
  { lifecycleRows: lifeClosedPz },
)
ok(activeClients.map((c) => c.id).join(',') === 'live', 'T4: partition active = только живой ПЗ')
ok(
  archivedClients.map((c) => c.id).sort().join(',') === 'abaeva,gone',
  'T4: partition archive = Абаева + архив клуба',
)

const azMems = [
  {
    id: 'm-az',
    client_id: 'abaeva',
    hall: 'az',
    start_date: '2026-08-01',
    end_date: '2026-12-31',
    total_trainings: 5,
    used_trainings: 0,
  },
]
ok(
  trainerPzClosedBadgeLabelForClient(abaeva, azMems, lifeClosedPz, asOf) === 'есть АЗ',
  'T5: бейдж «есть АЗ» после перехода',
)
ok(
  trainerPzClosedBadgeLabelForClient(clubArchived, [], [], asOf) === 'архив клуба',
  'T5: бейдж архив клуба',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
