/**
 * node scripts/verify-admin-clients-cross-hall-search.mjs
 */
import {
  buildClientHallStack,
  clientMatchesAdminSearchQuery,
  resolveAdminClientsSearchPool,
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

const emptyTz = buildClientHallStack({ trainer_id: 't' }, [{ hall: 'pz', start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 1 }], {
  today: '2026-08-10',
})
ok(emptyTz.length === 1 && emptyTz[0].hall === 'pz', 'pure pz no tz block')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll admin clients cross-hall search checks passed')
