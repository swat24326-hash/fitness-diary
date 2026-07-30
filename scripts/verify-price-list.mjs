import {
  buildPriceListRows,
  cellKey,
  emptyPriceListDocument,
  filterPriceListCatalogTypes,
  getPriceListCell,
  isPriceListCatalogType,
  matchMembershipTypeByExcelLabel,
  normalizePriceListDocument,
  normalizePriceListMode,
  priceFullFromDiscount10,
  priceWithDiscount10,
  removePriceListTariff,
  setPriceListCell,
  syncTariffsFromMembershipTypes,
  togglePriceListPeople,
} from '../src/lib/priceList/priceListCore.js'
import {
  priceListDocFromDbRow,
  priceListDocToDbRow,
} from '../src/lib/priceList/priceListDbCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizePriceListMode('day_discount') === 'day', 'day_discount → day')
ok(normalizePriceListMode('base') === 'base', 'base mode')
ok(priceWithDiscount10(1000) === 900, '10% off 1000 → 900')
ok(priceFullFromDiscount10(900) === 1000, '900 → full 1000')

const types = [
  { id: 't-pl', code: 'PL', trainer_assignable: true, is_active: true },
  { id: 't-vip', code: 'VIP', trainer_assignable: true, is_active: true },
  { id: 't-bz', code: 'БЗ', trainer_assignable: true, is_active: true, is_pnk_trial: true },
  { id: 't-bz2', code: 'БЗ', trainer_assignable: true, is_active: true },
  { id: 't-az', code: 'R1+', trainer_assignable: false, is_active: true },
]

ok(!isPriceListCatalogType(types[2]), 'pnk trial БЗ excluded')
ok(!isPriceListCatalogType(types[3]), 'code БЗ excluded even without flag')
ok(filterPriceListCatalogTypes(types).length === 2, 'catalog only PL+VIP')

ok(matchMembershipTypeByExcelLabel('Карта "Платинум"', types)?.code === 'PL', 'Excel Платинум → PL')
ok(matchMembershipTypeByExcelLabel('вип', types)?.code === 'VIP', 'Excel вип → VIP')
ok(matchMembershipTypeByExcelLabel('PL', types)?.code === 'PL', 'code PL → PL')

let doc = emptyPriceListDocument({ club_id: 'club-1' })
doc = syncTariffsFromMembershipTypes(doc, types)
ok(doc.tariffs.length === 2, 'only catalog types in tariffs')
ok(!doc.tariffs.some((t) => t.code === 'БЗ'), 'БЗ not in tariffs after sync')
ok(doc.tariffs.find((t) => t.code === 'VIP')?.is_vip === true, 'VIP marked is_vip')

doc = { ...doc, tariffs: [...doc.tariffs, { membership_type_id: 't-bz', code: 'БЗ', print_label: 'БЗ', sort_order: 9, is_vip: false }] }
doc = syncTariffsFromMembershipTypes(doc, types)
ok(!doc.tariffs.some((t) => t.code === 'БЗ'), 'resync drops БЗ column')

doc = setPriceListCell(doc, {
  sessions: 4,
  people: 1,
  membershipTypeId: 't-pl',
  mode: 'base',
  price_full: 3291,
})
let cell = getPriceListCell(doc, {
  sessions: 4,
  people: 1,
  membershipTypeId: 't-pl',
  mode: 'base',
})
ok(cell.price_full === 3291, 'cell price_full stored')
ok(cell.price_10 === 2962, 'price_10 derived from full')

doc = setPriceListCell(doc, {
  sessions: 4,
  people: 1,
  membershipTypeId: 't-pl',
  mode: 'base',
  price_10: 2962,
})
cell = getPriceListCell(doc, {
  sessions: 4,
  people: 1,
  membershipTypeId: 't-pl',
  mode: 'base',
})
ok(cell.price_10 === 2962, 'cell price_10 stored')
ok(cell.price_full === 3291, 'price_full derived from price_10')

const key = cellKey({ sessions: 4, people: 1, membershipTypeId: 't-pl', mode: 'base' })
ok(key === 'base:4:1:t-pl', 'cell key shape')

doc = togglePriceListPeople(doc, 2)
doc = togglePriceListPeople(doc, 3)
doc = togglePriceListPeople(doc, 4)
ok(JSON.stringify(doc.people) === JSON.stringify([1]), 'people can shrink to only 1')
ok(buildPriceListRows(doc).length === 3, '3 session rows × 1 people')

doc = togglePriceListPeople(doc, 5)
ok(doc.people.includes(5), 'people can include 5')

doc = removePriceListTariff(doc, 't-vip')
ok(!doc.tariffs.some((t) => t.code === 'VIP'), 'remove tariff column')

const norm = normalizePriceListDocument(doc, 'club-1')
ok(norm.club_id === 'club-1', 'normalize keeps club')
ok(norm.tariffs[0].membership_type_id, 'tariff linked to membership_type_id')

const row = priceListDocToDbRow(doc, 'club-1', 'user-1')
ok(row.club_id === 'club-1', 'db row club_id')
ok(Array.isArray(row.tariffs), 'db row tariffs array')
ok(row.updated_by === 'user-1', 'db row updated_by')
const fromDb = priceListDocFromDbRow(row, 'club-1')
ok(fromDb.club_id === 'club-1', 'from db keeps club')
ok(fromDb.tariffs.length === doc.tariffs.length, 'from db tariffs count')

process.exit(failed > 0 ? 1 : 0)
