/**
 * node scripts/verify-admin-clients-cross-hall-search.mjs
 */
import {
  adminClientSearchMissHint,
  buildClientHallStack,
  clientMatchesAdminSearchQuery,
  resolveAdminClientsSearchPool,
  resolveCrossHallSearchFactHall,
  shouldSearchAcrossHalls,
} from '../src/lib/admin/adminClientsCrossHallSearchCore.js'
import { filterClientsByAdminListTab } from '../src/lib/admin/deskHallClientsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(shouldSearchAcrossHalls('ми', 'active') === true, 'search across on short query≥2')
ok(shouldSearchAcrossHalls('м', 'active') === false, '1 char no cross')
ok(shouldSearchAcrossHalls('мишина', 'tz') === true, 'cross ignores tz tab')
ok(shouldSearchAcrossHalls('мишина', 'archive') === false, 'archive stays tab-bound')
ok(shouldSearchAcrossHalls('', 'active') === false, 'empty query no cross')

const pzOnly = { id: '1', name: 'Мишина', card_number: '3041', trainer_id: 't1', archived_at: null }
const tzOnly = { id: '2', name: 'Другой', card_number: '3741', desk_hall: 'tz', archived_at: null }
const archived = { id: '3', name: 'Мишина арх', card_number: '9', archived_at: '2026-01-01' }
const clients = [pzOnly, tzOnly, archived]
const memByClient = {
  1: [{ id: 'm1', hall: 'pz', start_date: '2026-05-01', end_date: '2026-08-31', total_trainings: 12 }],
  2: [{ id: 'm2', hall: 'tz', start_date: '2026-08-07', end_date: '2026-09-07' }],
}

const poolCross = resolveAdminClientsSearchPool({
  clients,
  clientsTab: 'active',
  query: 'ми',
  memByClient,
  filterByTab: filterClientsByAdminListTab,
})
ok(poolCross.length === 2 && !poolCross.some((c) => c.archived_at), 'cross pool excludes archive')
ok(poolCross.some((c) => c.id === '2'), 'cross pool includes desk tz while on ПЗ tab')

const poolTab = resolveAdminClientsSearchPool({
  clients,
  clientsTab: 'active',
  query: '',
  memByClient,
  filterByTab: filterClientsByAdminListTab,
})
ok(poolTab.every((c) => c.id === '1' || String(c.trainer_id)), 'empty query uses tab filter (pz)')

ok(clientMatchesAdminSearchQuery(pzOnly, '3041') === true, 'match card')
ok(clientMatchesAdminSearchQuery(pzOnly, 'викт') === false, 'no false name')
ok(clientMatchesAdminSearchQuery({ name: 'Мишина Виктория' }, 'мишин') === true, 'match name')

const phoneTwin = {
  name: 'Петров Пётр Петрович',
  phone: '+7 (912) 345-67-89',
  card_number: '3041',
}
ok(clientMatchesAdminSearchQuery(phoneTwin, '912345', 'card') === false, 'card mode ignores phone fragment')
ok(clientMatchesAdminSearchQuery(phoneTwin, '3041', 'phone') === false, 'phone mode ignores card')
ok(clientMatchesAdminSearchQuery(phoneTwin, '912345', 'phone') === true, 'phone mode matches digit fragment')
ok(clientMatchesAdminSearchQuery(phoneTwin, '89123456789', 'phone') === true, 'phone mode accepts 8-prefix')
ok(clientMatchesAdminSearchQuery(phoneTwin, '+7 912 345-67-89', 'phone') === true, 'phone mode accepts formatted number')
ok(clientMatchesAdminSearchQuery(phoneTwin, 'петров', 'phone') === true, 'surname works in phone mode')
ok(clientMatchesAdminSearchQuery(phoneTwin, 'петрович', 'card') === true, 'patronymic works in card mode')
ok(
  clientMatchesAdminSearchQuery({ name: 'А', card_number: 'р247', phone: '79001112233' }, '247', 'card') === true,
  'letter card partial',
)
ok(
  clientMatchesAdminSearchQuery({ name: 'А', card_number: 'р247', phone: '79001112233' }, 'р247', 'phone') === false,
  'card token does not scan phones',
)
ok(
  clientMatchesAdminSearchQuery({ name: 'А', card_number: '3041', phone: '+7 999 304-11-22' }, '№3041', 'phone') ===
    false,
  '№ карты в режиме телефона не сканирует чужие номера',
)
ok(
  clientMatchesAdminSearchQuery({ name: 'А', card_number: '3041', phone: '+7 999 304-11-22' }, '№3041', 'card') ===
    true,
  '№ карты находится в режиме карты',
)
ok(adminClientSearchMissHint('79123456789', 'card').includes('трубк'), 'long number in card mode hints phone')
ok(adminClientSearchMissHint('3041', 'card') === '', 'short card has no phone hint')
ok(adminClientSearchMissHint('р247', 'phone').includes('карт'), 'card token in phone mode hints card')

const multiClient = {
  id: 'm',
  name: 'Гибрид',
  trainer_id: 't1',
  desk_hall: null,
}
const multiMem = [
  { id: 'a', hall: 'pz', start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 10 },
  { id: 'b', hall: 'tz', start_date: '2026-08-01', end_date: '2026-09-01' },
]
const stack = buildClientHallStack(multiClient, multiMem, {
  today: '2026-08-10',
  trainerName: 'Анжелика',
})
ok(stack.length === 2, 'stack has pz+tz only')
ok(stack[0].hall === 'pz' && stack[0].label === 'ПЗ', 'pz first')
ok(stack[1].hall === 'tz' && stack[1].hrefHall === 'tz', 'tz second')
ok(stack[0].summary.includes('Анжелика'), 'pz summary has trainer')
ok(!stack.some((s) => s.hall === 'az'), 'no empty az window')
ok(resolveCrossHallSearchFactHall(stack, 'tz') === 'pz', 'fact hall prefers stack first (pz)')
ok(resolveCrossHallSearchFactHall([], 'az') === 'az', 'fact hall fallback')
ok(resolveCrossHallSearchFactHall([], null) === '', 'fact hall empty')
ok(
  resolveCrossHallSearchFactHall([{ hrefHall: 'tz', hall: 'tz' }], 'pz') === 'tz',
  'card hall uses hrefHall from stack',
)

const emptyTz = buildClientHallStack({ trainer_id: 't' }, [{ hall: 'pz', start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 1 }], {
  today: '2026-08-10',
})
ok(emptyTz.length === 1 && emptyTz[0].hall === 'pz', 'pure pz no tz block')

// TZ-only in cross-hall from ПЗ tab → card hall must be tz, not pz
const tzStack = buildClientHallStack(tzOnly, memByClient[2], { today: '2026-08-10' })
ok(tzStack[0]?.hall === 'tz', 'tz-only stack')
ok(resolveCrossHallSearchFactHall(tzStack, 'pz') === 'tz', 'tz-only card hall ignores tab pz')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll admin clients cross-hall search checks passed')
