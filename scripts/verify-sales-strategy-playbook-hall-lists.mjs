import {
  describeHallClosingsListMetaRu,
  filterPlaybookClosingsByHall,
  flattenPlaybookEndings,
  normalizePlaybookHall,
  PLAYBOOK_HALL_LIST_TITLES,
  summarizePlaybookClosingsByHall,
  sumPlaybookClosingsAmount,
} from '../src/lib/admin/salesStrategyPlaybookHallListsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizePlaybookHall('TZ') === 'tz', 'normalize tz')
ok(normalizePlaybookHall('x') === 'pz', 'unknown → pz')
ok(PLAYBOOK_HALL_LIST_TITLES.pz.includes('ПЗ'), 'title pz')

const playbook = {
  weeks: [
    {
      endings: [
        { clientId: '1', clientName: 'B', hall: 'pz', endDate: '2026-08-20', amount: 1000 },
        { clientId: '2', clientName: 'A', hall: 'az', endDate: '2026-08-10', amount: 2000 },
      ],
    },
    {
      endings: [
        { clientId: '3', clientName: 'C', hall: 'pz', endDate: '2026-08-05', amount: 3000 },
        { clientId: '4', clientName: 'D', hall: 'tz', endDate: '2026-08-12', amount: 500, confirmed: true },
      ],
    },
  ],
}

const flat = flattenPlaybookEndings(playbook)
ok(flat.length === 4, 'flatten 4')

const pz = filterPlaybookClosingsByHall(flat, 'pz')
ok(pz.length === 2, 'pz filter 2')
ok(pz[0].endDate === '2026-08-05' && pz[1].endDate === '2026-08-20', 'pz sorted by date')

const sum = summarizePlaybookClosingsByHall(flat)
ok(sum.byHall.pz.count === 2 && sum.byHall.pz.openCount === 2, 'pz counts')
ok(sum.byHall.tz.count === 1 && sum.byHall.tz.openCount === 0, 'tz confirmed not open')
ok(sum.byHall.az.amount === 2000, 'az amount')
ok(sum.total === 4, 'total 4')

ok(
  describeHallClosingsListMetaRu({ count: 57, amount: 123456 }) ===
    '57 в списке на сумму 123 456 ₽' ||
    describeHallClosingsListMetaRu({ count: 57, amount: 123456 }).includes('на сумму'),
  'meta count + sum',
)
ok(describeHallClosingsListMetaRu({ count: 0, amount: 0 }) === '0 в списке', 'meta empty')
ok(sumPlaybookClosingsAmount(pz) === 4000, 'sum pz amounts')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales-strategy-playbook-hall-lists checks passed')
