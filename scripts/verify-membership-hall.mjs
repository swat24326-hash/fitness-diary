/**
 * node scripts/verify-membership-hall.mjs
 */
import {
  canFullyDeleteClientOnPnkRefuse,
  clientMembershipHallSet,
  filterMembershipsByHall,
  inferMembershipHallFromClient,
  membershipHallOf,
  normalizeMembershipHall,
} from '../src/lib/membershipHallCore.js'
import {
  adminUsesMultiHallClientCard,
  clientNeedsMultiHallCard,
  resolveInitialClientHallTab,
  roleCanManageMultiHallClientCard,
  trainerOwnsClientForTablet,
} from '../src/lib/admin/clientHallTabsCore.js'
import {
  buildPnkAttachClientRow,
  resolvePnkCreateAttachTarget,
} from '../src/lib/pnk/pnkCreateAttachCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeMembershipHall('ТЗ') === 'tz', 'normalize tz')
ok(normalizeMembershipHall('pz') === 'pz', 'normalize pz')
ok(inferMembershipHallFromClient({ desk_hall: 'az' }) === 'az', 'infer az')
ok(inferMembershipHallFromClient({ trainer_id: 't1' }) === 'pz', 'infer pz')
ok(membershipHallOf({ hall: 'tz' }, { desk_hall: 'az' }) === 'tz', 'hall field wins')
ok(membershipHallOf({}, { desk_hall: 'tz' }) === 'tz', 'legacy from client')

const multi = [
  { id: '1', hall: 'pz' },
  { id: '2', hall: 'tz' },
]
ok(filterMembershipsByHall(multi, 'tz').map((m) => m.id).join() === '2', 'filter tz')
ok(clientMembershipHallSet({ id: 'c' }, multi).has('pz') && clientMembershipHallSet({ id: 'c' }, multi).has('tz'), 'set both')

ok(clientMembershipHallSet({ desk_hall: null }, []).has('pz'), 'legacy empty → pz tab')
ok(clientMembershipHallSet({ desk_hall: 'tz' }, []).has('tz'), 'legacy desk tz')

ok(
  canFullyDeleteClientOnPnkRefuse({ lifecycle: 'pnk' }, [{ hall: 'tz' }]) === false,
  'refuse keep if tz',
)
ok(canFullyDeleteClientOnPnkRefuse({ lifecycle: 'pnk', trainer_id: 't' }, [{ hall: 'pz', total_trainings: 1 }]) === true, 'pure pnk deletable')

ok(clientNeedsMultiHallCard({ desk_hall: 'tz' }, []) === true, 'needs multi desk')
ok(clientNeedsMultiHallCard({ trainer_id: 't' }, [{ hall: 'pz' }]) === false, 'pure pz no desk halls')
ok(
  adminUsesMultiHallClientCard({ isAdmin: true }, { id: 'c1', trainer_id: 't' }) === true,
  'admin always multi-hall UI',
)
ok(adminUsesMultiHallClientCard({ isAdmin: true }, null) === false, 'no client no card')
ok(
  adminUsesMultiHallClientCard({ isAdmin: false, isSalesManager: false, isSupervisor: false }, { id: 'c' }) ===
    false,
  'trainer role no multi-hall UI',
)
ok(resolveInitialClientHallTab({ desk_hall: 'az' }, [], null) === 'az', 'initial az')

ok(roleCanManageMultiHallClientCard({ isAdmin: true }) === true, 'admin multi-hall card')
ok(roleCanManageMultiHallClientCard({ isSalesManager: true }) === true, 'sales multi-hall card')
ok(roleCanManageMultiHallClientCard({ isSupervisor: true }) === true, 'supervisor multi-hall card')
ok(roleCanManageMultiHallClientCard({ isAdmin: false, isSalesManager: false, isSupervisor: false }) === false, 'trainer no multi-hall UI')
ok(trainerOwnsClientForTablet({ trainer_id: 't1' }, 't1') === true, 'trainer owns own PZ')
ok(trainerOwnsClientForTablet({ trainer_id: null, desk_hall: 'tz' }, 't1') === false, 'trainer no desk-only')
ok(trainerOwnsClientForTablet({ trainer_id: 'other' }, 't1') === false, 'trainer no foreign PZ')

const deskClient = {
  id: 'desk1',
  name: 'Иванов',
  phone: '79001234567',
  card_number: '7199',
  desk_hall: 'tz',
  trainer_id: null,
}
ok(
  resolvePnkCreateAttachTarget({
    clients: [deskClient],
    phone: '',
    cardNumber: '7199',
  }).action === 'attach',
  'pnk attach by card',
)
const attached = buildPnkAttachClientRow(deskClient, {
  name: 'Иванов Пётр',
  phone: '79001234567',
  cardNumber: '7199',
  trainerId: 'tr1',
  pnk_trial_sessions: 1,
})
ok(attached.trainer_id === 'tr1' && attached.card_number === '7199', 'attach keeps card + trainer')
ok(String(attached.lifecycle ?? '') === 'pnk' || Boolean(attached.pnk_created_at), 'attach sets pnk')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll membership hall checks passed')
