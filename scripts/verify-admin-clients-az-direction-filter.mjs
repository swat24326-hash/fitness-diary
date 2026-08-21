/**
 * node scripts/verify-admin-clients-az-direction-filter.mjs
 */
import {
  AZ_DIRECTION_FILTER_ALL,
  AZ_DIRECTION_FILTER_NONE,
  buildAzDirectionFilterOptions,
  clientMatchesAzDirectionFilter,
  normalizeAzDirectionFilterId,
  resolveAzClientDirectionTypeId,
} from '../src/lib/admin/adminClientsAzDirectionFilterCore.js'
import { shouldShowAdminClientsList } from '../src/lib/admin/adminClientsBrowseCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeAzDirectionFilterId('') === AZ_DIRECTION_FILTER_ALL, 'all empty')
ok(normalizeAzDirectionFilterId('none') === AZ_DIRECTION_FILTER_NONE, 'none alias')
ok(normalizeAzDirectionFilterId('type-1') === 'type-1', 'type id')

const today = '2026-08-04'
const boxMem = [
  {
    hall: 'az',
    membership_type_id: 'box',
    start_date: '2026-07-01',
    end_date: '2026-09-01',
    total_trainings: 10,
    used_trainings: 2,
  },
]
const noTypeMem = [
  {
    hall: 'az',
    membership_type_id: null,
    start_date: '2026-07-01',
    end_date: '2026-09-01',
    total_trainings: 0,
    used_trainings: 0,
  },
]
const expiredThenBox = [
  {
    hall: 'az',
    membership_type_id: 'step',
    start_date: '2026-01-01',
    end_date: '2026-02-01',
    total_trainings: 8,
    used_trainings: 8,
  },
  {
    hall: 'az',
    membership_type_id: 'box',
    start_date: '2026-07-01',
    end_date: '2026-09-01',
    total_trainings: 10,
    used_trainings: 1,
  },
]

ok(resolveAzClientDirectionTypeId(boxMem, today) === 'box', 'active box')
ok(resolveAzClientDirectionTypeId(noTypeMem, today) === '', 'no type')
ok(resolveAzClientDirectionTypeId(expiredThenBox, today) === 'box', 'usable wins over old')

const multiHallMem = [
  {
    hall: 'pz',
    membership_type_id: 'pz-vip',
    start_date: '2026-07-01',
    end_date: '2026-12-01',
    total_trainings: 12,
    used_trainings: 1,
  },
  {
    hall: 'az',
    membership_type_id: 'box',
    start_date: '2026-01-01',
    end_date: '2026-02-01',
    total_trainings: 8,
    used_trainings: 8,
  },
]
ok(
  resolveAzClientDirectionTypeId(multiHallMem, today) === 'box',
  'fallback only AZ — not PZ type',
)
ok(
  resolveAzClientDirectionTypeId(
    [{ hall: 'pz', membership_type_id: 'pz-vip', start_date: '2026-07-01', end_date: '2026-12-01' }],
    today,
  ) === '',
  'no AZ mems → empty',
)

ok(clientMatchesAzDirectionFilter(boxMem, '', today), 'all matches')
ok(clientMatchesAzDirectionFilter(boxMem, 'box', today), 'box matches')
ok(!clientMatchesAzDirectionFilter(boxMem, 'step', today), 'step rejects box')
ok(clientMatchesAzDirectionFilter(noTypeMem, AZ_DIRECTION_FILTER_NONE, today), 'none matches empty')
ok(!clientMatchesAzDirectionFilter(boxMem, AZ_DIRECTION_FILTER_NONE, today), 'none rejects typed')

const clients = [
  { id: 'c1', desk_hall: 'az' },
  { id: 'c2', desk_hall: 'az' },
  { id: 'c3', desk_hall: 'az' },
]
const memByClient = {
  c1: boxMem,
  c2: [
    {
      hall: 'az',
      membership_type_id: 'step',
      start_date: '2026-07-01',
      end_date: '2026-09-01',
      total_trainings: 0,
      used_trainings: 0,
    },
  ],
  c3: noTypeMem,
}
const azTypes = [
  { id: 'box', name: 'Бокс' },
  { id: 'step', name: 'Степ' },
  { id: 'unused', name: 'Пустой' },
]

const opts = buildAzDirectionFilterOptions({
  clients,
  memByClient,
  azTypes,
  todayIso: today,
})
ok(opts[0].id === AZ_DIRECTION_FILTER_ALL && opts[0].count === 3, 'all chip')
ok(opts.some((o) => o.id === 'box' && o.count === 1 && o.label === 'Бокс'), 'box chip')
ok(opts.some((o) => o.id === 'step' && o.count === 1), 'step chip')
ok(!opts.some((o) => o.id === 'unused'), 'unused type hidden')
ok(opts.some((o) => o.id === AZ_DIRECTION_FILTER_NONE && o.count === 1), 'none chip')

ok(
  !shouldShowAdminClientsList({ browseMode: 'none', clientsTab: 'az' }),
  'list hidden without dir',
)
ok(
  shouldShowAdminClientsList({
    browseMode: 'none',
    clientsTab: 'az',
    azDirectionFilter: 'box',
  }),
  'list shown with dir',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll admin-clients-az-direction-filter checks passed')
