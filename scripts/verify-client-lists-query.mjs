/**
 * node scripts/verify-client-lists-query.mjs
 */
import {
  CLIENT_LISTS_HALLS,
  buildClientListsSearchParams,
  clientArchivedOnIso,
  isoDayInInclusiveRange,
  normalizeClientListsCriterion,
  normalizeClientListsHalls,
  normalizeClientListsPool,
  normalizeClientListsQuery,
  parseClientListsSearchParams,
  queryClientLists,
} from '../src/lib/admin/clientListsQueryCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeClientListsPool('archive') === 'archive', 'pool archive')
ok(normalizeClientListsPool('') === 'live', 'pool default live')
ok(normalizeClientListsCriterion('истекает') === 'expiring', 'criterion ru')
ok(normalizeClientListsCriterion('x') === 'all', 'criterion fallback')
ok(normalizeClientListsHalls([]).join() === 'pz,tz,az', 'halls empty → all')
ok(normalizeClientListsHalls(['аз', 'tz']).join() === 'tz,az', 'halls order')
ok(normalizeClientListsHalls('pz,az').join() === 'pz,az', 'halls string')

const q = normalizeClientListsQuery({
  pool: 'archive',
  halls: ['tz'],
  criterion: 'birthdays',
  birthdayDays: 0,
  archiveFrom: '2026-01-01',
  archiveTo: '2026-01-31',
  today: '2026-07-22',
})
ok(q.pool === 'archive' && q.halls.join() === 'tz' && q.birthdayDays === 0, 'query normalize')
ok(clientArchivedOnIso('2026-01-15T12:00:00Z') === '2026-01-15', 'archived on')
ok(isoDayInInclusiveRange('2026-01-15', '2026-01-01', '2026-01-31') === true, 'in range')
ok(isoDayInInclusiveRange('2026-02-01', '2026-01-01', '2026-01-31') === false, 'out of range')

const today = '2026-07-22'
const clients = [
  {
    id: 'pz1',
    name: 'Петров',
    trainer_id: 't1',
    birth_date: '1990-07-22',
  },
  {
    id: 'tz1',
    name: 'Сидоров',
    desk_hall: 'tz',
    birth_date: '1990-08-01',
  },
  {
    id: 'az1',
    name: 'Азова',
    desk_hall: 'az',
  },
  {
    id: 'arch1',
    name: 'Архивный',
    desk_hall: 'tz',
    archived_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'arch2',
    name: 'Архив поздно',
    desk_hall: 'az',
    archived_at: '2026-03-01',
  },
  {
    id: 'mix1',
    name: 'Смешанный',
    trainer_id: 't1',
  },
]

const memBy = {
  pz1: [
    {
      hall: 'pz',
      start_date: '2026-01-01',
      end_date: '2026-07-24',
      total_trainings: 12,
      used_trainings: 1,
    },
  ],
  tz1: [
    {
      hall: 'tz',
      start_date: '2026-01-01',
      end_date: '2026-07-24',
      total_trainings: 0,
      used_trainings: 0,
    },
  ],
  az1: [
    {
      hall: 'az',
      start_date: '2026-01-01',
      end_date: '2026-12-01',
      total_trainings: 10,
      used_trainings: 1,
    },
  ],
  arch1: [
    {
      hall: 'tz',
      start_date: '2025-01-01',
      end_date: '2025-06-01',
      total_trainings: 0,
      used_trainings: 0,
    },
  ],
  arch2: [
    {
      hall: 'az',
      start_date: '2025-01-01',
      end_date: '2025-06-01',
      total_trainings: 8,
      used_trainings: 8,
    },
  ],
  mix1: [
    {
      hall: 'pz',
      start_date: '2026-01-01',
      end_date: '2026-12-01',
      total_trainings: 20,
      used_trainings: 2,
    },
    {
      hall: 'tz',
      start_date: '2026-01-01',
      end_date: '2026-12-01',
      total_trainings: 0,
      used_trainings: 0,
    },
  ],
}

const livePz = queryClientLists({
  clients,
  memByClient: memBy,
  query: { pool: 'live', halls: ['pz'], criterion: 'all', today },
})
ok(livePz.rows.map((r) => r.clientId).join() === 'pz1,mix1', 'live pz')

const liveTzAz = queryClientLists({
  clients,
  memByClient: memBy,
  query: { pool: 'live', halls: ['tz', 'az'], criterion: 'all', today },
})
ok(liveTzAz.rows.map((r) => r.clientId).join() === 'az1,tz1,mix1', 'live tz+az sorted')

const bdayToday = queryClientLists({
  clients,
  memByClient: memBy,
  query: { pool: 'live', halls: ['pz'], criterion: 'birthdays', birthdayDays: 0, today },
})
ok(bdayToday.rows.map((r) => r.clientId).join() === 'pz1', 'birthdays today pz')

const expiring = queryClientLists({
  clients,
  memByClient: memBy,
  query: { pool: 'live', halls: ['tz'], criterion: 'expiring', today },
})
ok(expiring.rows.map((r) => r.clientId).join() === 'tz1', 'expiring tz')

const archivePeriod = queryClientLists({
  clients,
  memByClient: memBy,
  query: {
    pool: 'archive',
    halls: ['tz', 'az'],
    criterion: 'all',
    archiveFrom: '2026-01-01',
    archiveTo: '2026-01-31',
    today,
  },
})
ok(archivePeriod.rows.map((r) => r.clientId).join() === 'arch1', 'archive period tz')

const archiveAll = queryClientLists({
  clients,
  memByClient: memBy,
  query: { pool: 'archive', halls: CLIENT_LISTS_HALLS, criterion: 'all', today },
})
ok(archiveAll.count === 2, 'archive all halls')

const liveSkipsArchive = queryClientLists({
  clients,
  memByClient: memBy,
  query: { pool: 'live', halls: ['tz'], criterion: 'all', today },
})
ok(!liveSkipsArchive.rows.some((r) => r.clientId === 'arch1'), 'live skips archive')

const qs = buildClientListsSearchParams({
  pool: 'archive',
  halls: ['tz'],
  criterion: 'birthdays',
  birthdayDays: 7,
  archiveFrom: '2026-01-01',
  archiveTo: '2026-01-31',
})
ok(qs.get('pool') === 'archive' && qs.get('halls') === 'tz' && qs.get('bday') === '7', 'build lists qs')
const parsed = parseClientListsSearchParams(qs)
ok(parsed.pool === 'archive' && parsed.halls.join() === 'tz' && parsed.birthdayDays === 7, 'parse lists qs')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall ok')
