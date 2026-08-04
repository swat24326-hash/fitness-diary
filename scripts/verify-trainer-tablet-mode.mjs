/**
 * node scripts/verify-trainer-tablet-mode.mjs
 */
import {
  collectNoTabletTrainerIds,
  isClientOnNoTabletTrainer,
  isLitePzClient,
  isTrainerWithoutTablet,
} from '../src/lib/admin/trainerTabletModeCore.js'
import { filterHallOperationalClients } from '../src/lib/admin/holdingClientsCore.js'
import {
  listNoTabletTrainersForClub,
  validateLitePzCreateForm,
} from '../src/lib/admin/litePzClientCreateCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isTrainerWithoutTablet({ uses_tablet: false }), 'without tablet')
ok(!isTrainerWithoutTablet({ uses_tablet: true }), 'with tablet')
ok(!isTrainerWithoutTablet({}), 'default missing = with tablet')

const trainers = [
  { id: 't1', uses_tablet: true, name: 'А', club_id: 'c1', is_active: true },
  { id: 't2', uses_tablet: false, name: 'Б', club_id: 'c1', is_active: true },
  { id: 't3', uses_tablet: false, name: 'В', club_id: 'c2', is_active: true },
]
const noTab = collectNoTabletTrainerIds(trainers)
ok(noTab.has('t2') && !noTab.has('t1'), 'collect no-tablet ids')

const lite = { id: 'c1', trainer_id: 't2', desk_hall: null }
const full = { id: 'c2', trainer_id: 't1', desk_hall: null }
const desk = { id: 'c3', trainer_id: null, desk_hall: 'tz' }

ok(isLitePzClient(lite, noTab), 'lite by set')
ok(!isLitePzClient(full, noTab), 'full not lite')
ok(!isLitePzClient(desk, noTab), 'desk not lite')
ok(isClientOnNoTabletTrainer(lite, noTab), 'on no-tablet trainer')

const ops = filterHallOperationalClients([lite, full, desk], new Set(), noTab)
ok(ops.length === 1 && ops[0].id === 'c2', 'ops exclude lite+desk')

const { filterCommercialClients } = await import('../src/lib/admin/holdingClientsCore.js')
const commercial = filterCommercialClients([lite, full, desk], new Set())
ok(commercial.length === 2 && commercial.some((c) => c.id === 'c1'), 'commercial includes lite, not desk')

const { aggregateClubClientPeriod } = await import('../src/lib/admin/clubClientPeriodAgg.js')
const mems = [
  { client_id: 'c1', start_date: '2026-07-01', end_date: '2026-09-01', total_trainings: 0, used_trainings: 0 },
  { client_id: 'c2', start_date: '2026-07-01', end_date: '2026-09-01', total_trainings: 8, used_trainings: 1 },
]
const period = aggregateClubClientPeriod([lite, full, desk], mems, '2026-08-02', '2026-08-02', '2026-08-02', {
  noTabletTrainerIds: noTab,
})
ok(period.activeWithMembership === 2, 'active membership counts lite')
ok(period.inactiveInPeriod === 0, 'inactive excludes lite with empty diary noise')

const liteExpired = {
  id: 'c1',
  trainer_id: 't2',
  desk_hall: null,
}
const memExpired = [
  { client_id: 'c1', start_date: '2026-01-01', end_date: '2026-02-01', total_trainings: 0, used_trainings: 0 },
]
const period2 = aggregateClubClientPeriod([liteExpired], memExpired, '2026-08-02', '2026-08-02', '2026-08-02', {
  noTabletTrainerIds: noTab,
})
ok(period2.totalClients === 1 && period2.inactiveInPeriod === 0, 'lite expired not in inactive list')
ok(period2.activeWithMembership === 0, 'lite expired not active')

const clubNoTab = listNoTabletTrainersForClub(trainers, 'c1')
ok(clubNoTab.length === 1 && clubNoTab[0].id === 't2', 'no-tablet trainers for club')

const bad = validateLitePzCreateForm({ name: '', trainer_id: 't2', club_id: 'c1' }, clubNoTab)
ok(!bad.ok, 'create rejects empty name')

const good = validateLitePzCreateForm(
  {
    name: 'Иванов Иван',
    trainer_id: 't2',
    club_id: 'c1',
    start_date: '2026-08-01',
    package_months: 1,
    paid_amount: '5000',
  },
  clubNoTab,
)
ok(good.ok && good.client.trainer_id === 't2' && good.membership.paid_amount === 5000, 'create ok')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll trainer tablet mode checks passed')
