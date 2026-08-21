/**
 * node scripts/verify-desk-manual-client-create.mjs
 */
import {
  initialDeskManualCreateForm,
  manualCreateHallFromClientsTab,
  normalizeManualCreateHall,
  validateDeskManualCreateForm,
} from '../src/lib/admin/deskManualClientCreateCore.js'
import { assertSalesManagerClientInsert } from '../src/lib/admin/salesManagerClientsAccessCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(manualCreateHallFromClientsTab('active') === 'pz', 'tab active → pz')
ok(manualCreateHallFromClientsTab('tz') === 'tz', 'tab tz')
ok(manualCreateHallFromClientsTab('az') === 'az', 'tab az')
ok(manualCreateHallFromClientsTab('archive') == null, 'tab archive → null')
ok(normalizeManualCreateHall('ТЗ') === 'tz', 'norm ТЗ')
ok(normalizeManualCreateHall('pz') === 'pz', 'norm pz')

const tzForm = {
  ...initialDeskManualCreateForm('tz', 'club1'),
  name: 'Иванов Иван',
  card_number: '100',
  start_date: '2026-08-01',
  end_date: '2026-09-01',
  package_months: '1',
}
const tzOk = validateDeskManualCreateForm(tzForm, { clubClients: [] })
ok(tzOk.ok === true, 'tz valid')
ok(tzOk.ok && tzOk.client.trainer_id === null && tzOk.client.desk_hall === 'tz', 'tz desk client')
ok(tzOk.ok && tzOk.membership.hall === 'tz' && tzOk.membership.total_trainings === 0, 'tz mem')

const azTypes = [{ id: 'type-box', name: 'Бокс', trainer_assignable: false }]
const azForm = {
  ...initialDeskManualCreateForm('az', 'club1'),
  name: 'Петров Пётр',
  card_number: '200',
  start_date: '2026-08-01',
  end_date: '2026-11-01',
  membership_type_id: 'type-box',
  total_trainings: '12',
}
const azOk = validateDeskManualCreateForm(azForm, { azTypes, clubClients: [] })
ok(azOk.ok === true, 'az valid')
ok(azOk.ok && azOk.client.desk_hall === 'az' && azOk.membership.membership_type_id === 'type-box', 'az direction')
ok(azOk.ok && azOk.membership.total_trainings === 12, 'az sessions')

const azNoType = validateDeskManualCreateForm(
  { ...azForm, membership_type_id: '' },
  { azTypes, clubClients: [] },
)
ok(azNoType.ok === false && /направлен/i.test(azNoType.error), 'az needs direction')

const azBadSessions = validateDeskManualCreateForm(
  { ...azForm, total_trainings: '0' },
  { azTypes, clubClients: [] },
)
ok(azBadSessions.ok === false, 'az sessions >= 1')

const azFraction = validateDeskManualCreateForm(
  { ...azForm, total_trainings: '1.5' },
  { azTypes, clubClients: [] },
)
ok(azFraction.ok === false, 'az sessions integer')

const azUnknownType = validateDeskManualCreateForm(
  { ...azForm, membership_type_id: 'no-such-type' },
  { azTypes, clubClients: [] },
)
ok(azUnknownType.ok === false && /не найдено/i.test(azUnknownType.error || ''), 'az type must exist')

const endBeforeStart = validateDeskManualCreateForm(
  { ...tzForm, start_date: '2026-09-01', end_date: '2026-08-01' },
  { clubClients: [] },
)
ok(endBeforeStart.ok === false && /раньше/i.test(endBeforeStart.error || ''), 'end < start')

const badPaid = validateDeskManualCreateForm(
  { ...tzForm, paid_amount: 'abc' },
  { clubClients: [] },
)
ok(badPaid.ok === false && /цен/i.test(badPaid.error || ''), 'paid non-number')

const negPaid = validateDeskManualCreateForm(
  { ...tzForm, paid_amount: '-10' },
  { clubClients: [] },
)
ok(negPaid.ok === false, 'paid negative')

const emptyCard = validateDeskManualCreateForm(
  { ...tzForm, card_number: '' },
  { clubClients: [{ id: 'c1', club_id: 'club1', card_number: '100' }] },
)
ok(emptyCard.ok === true && emptyCard.client.card_number == null, 'empty card allowed')

const otherClubSameCard = validateDeskManualCreateForm(tzForm, {
  clubClients: [{ id: 'c2', club_id: 'club-other', card_number: '100' }],
})
ok(otherClubSameCard.ok === true, 'same card other club ok')

const archivedDup = validateDeskManualCreateForm(tzForm, {
  clubClients: [
    { id: 'c-arch', club_id: 'club1', card_number: '100', archived_at: '2026-01-01T00:00:00.000Z' },
  ],
})
ok(archivedDup.ok === false && /архив/i.test(archivedDup.error || ''), 'archived card blocks create')

const dup = validateDeskManualCreateForm(tzForm, {
  clubClients: [{ id: 'c1', club_id: 'club1', card_number: '100' }],
})
ok(dup.ok === false && /карт/i.test(dup.error || ''), 'duplicate card blocked')

const pzRejected = validateDeskManualCreateForm(
  { ...tzForm, hall: 'pz' },
  { clubClients: [] },
)
ok(pzRejected.ok === false, 'pz not allowed in desk core')

const noName = validateDeskManualCreateForm({ ...tzForm, name: '' }, { clubClients: [] })
ok(noName.ok === false, 'name required')

const smDesk = assertSalesManagerClientInsert('club1', {
  club_id: 'club1',
  desk_hall: 'tz',
  trainer_id: null,
})
ok(smDesk.ok === true, 'SM insert desk tz')

const smDeskWithTrainer = assertSalesManagerClientInsert('club1', {
  club_id: 'club1',
  desk_hall: 'az',
  trainer_id: 't1',
})
ok(smDeskWithTrainer.ok === false, 'SM desk cannot have trainer')

const smLite = assertSalesManagerClientInsert('club1', {
  club_id: 'club1',
  desk_hall: null,
  trainer_id: 't-lite',
})
ok(smLite.ok === true, 'SM insert lite with trainer')

const smWrongClub = assertSalesManagerClientInsert('club1', {
  club_id: 'club2',
  desk_hall: 'tz',
  trainer_id: null,
})
ok(smWrongClub.ok === false, 'SM wrong club blocked')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll desk manual client create checks passed')
