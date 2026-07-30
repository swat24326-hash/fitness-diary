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
import {
  isPriceListCloudFresh,
  parsePriceListLocalCache,
  PRICE_LIST_CLOUD_TTL_MS,
  wrapPriceListLocalCache,
} from '../src/lib/priceList/priceListCacheCore.js'
import { SALES_SHELL_SESSION_TTL_MS } from '../src/lib/admin/salesShellSession.js'
import {
  applyExcelImportToPriceListDocument,
  detectExcelTariffColumnPairs,
  isExcelDiscount10ColumnLabel,
  parsePriceListWorkbookSheets,
  parsePzMatrixSheet,
  suggestExcelColumnMapping,
} from '../src/lib/priceList/priceListExcelImportCore.js'
import {
  assertPriceListClubAccess,
  assertPriceListWriteAccess,
} from '../src/lib/priceList/priceListAccessCore.js'
import {
  buildPriceListPngFileName,
  formatPriceListMoney,
  priceListModePrintLabel,
} from '../src/lib/priceList/priceListExportCore.js'
import { buildPriceListPrintHtml, formatPriceListValidFromRu } from '../src/lib/priceList/priceListPrintHtml.js'

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

ok(PRICE_LIST_CLOUD_TTL_MS === 7 * 24 * 60 * 60 * 1000, 'price cloud TTL 7d')
ok(isPriceListCloudFresh(Date.now() - 1000), 'fresh within TTL')
ok(!isPriceListCloudFresh(Date.now() - PRICE_LIST_CLOUD_TTL_MS - 1), 'stale after TTL')
ok(!isPriceListCloudFresh(0), 'fetchedAt 0 not fresh')
const wrapped = wrapPriceListLocalCache(doc, 12345)
ok(wrapped.v === 1 && wrapped.fetchedAt === 12345, 'wrap cache envelope')
const parsedNew = parsePriceListLocalCache(wrapped)
ok(parsedNew.fetchedAt === 12345 && parsedNew.doc?.club_id === 'club-1', 'parse v1 envelope')
const parsedLegacy = parsePriceListLocalCache({ ...doc, club_id: 'club-1' })
ok(parsedLegacy.fetchedAt === 0 && parsedLegacy.doc?.tariffs, 'legacy bare doc → fetchedAt 0')
ok(SALES_SHELL_SESSION_TTL_MS === 6 * 60 * 60 * 1000, 'sales shell session TTL 6h')

ok(matchMembershipTypeByExcelLabel('ВИП2', [
  { id: 'vip', code: 'VIP' },
  { id: 'vip2', code: 'VIP2' },
])?.id === 'vip2', 'ВИП2 → VIP2 not VIP')

ok(isExcelDiscount10ColumnLabel('Карта "Платинум" - 10%'), 'detect −10% column')
ok(!isExcelDiscount10ColumnLabel('Карта "Платинум"'), 'full column not discount')

const header = [
  'кол-во тренировок в месяц',
  'кол-во человек',
  'Карта "Платинум"',
  'Карта "Платинум" - 10%',
  'разница в рублях',
  'вип',
  'вип - 10%',
]
const pairs = detectExcelTariffColumnPairs(header, 2)
ok(pairs.length === 2 && pairs[0].excelLabel.includes('Платинум'), 'pair platinum + vip')
ok(pairs[0].discountCol === 3, 'platinum discount col')

const pzRows = [
  ['г. Тест 8-900-000-00-00'],
  [],
  [],
  ['Персональный зал'],
  header,
  [4, 1, 3258.5, 2962, 296, 4922, 4430],
  [null, 2, 2122, 1910, 212, null, null],
  ['Цены действительны с 21.07.2026'],
]
const pz = parsePzMatrixSheet(pzRows, 'base')
ok(pz.ok && pz.cells.length === 3, 'pz matrix cells')
ok(pz.meta?.valid_from === '2026-07-21', 'valid_from from excel')

const wb = parsePriceListWorkbookSheets([
  { name: 'ПЗ базовая стоимость', rows: pzRows },
  {
    name: 'VIP2',
    rows: [
      ['addr'],
      [],
      [],
      [],
      [],
      [],
      [],
      ['', '', 'Персональный зал'],
      ['', '', 'Базовая'],
      ['', '', 'Кол-во тренировок в месяц', 'Кол-во человек', 'ВИП2', '', 'ВИП2день'],
      ['', '', '', '', 'Базовая', 'Скидка 10%', 'Базовая', 'Скидка 10%'],
      ['', '', 4, 1, 5677, 5110, 5166, 4650],
      ['', '', 8, null, 11053, 9948, 10200, 9180],
    ],
  },
])
ok(wb.ok && wb.excelLabels.includes('Карта "Платинум"'), 'workbook labels')
const importTypes = [
  { id: 'pl', code: 'PL', trainer_assignable: true, is_active: true },
  { id: 'vip2', code: 'VIP2', trainer_assignable: true, is_active: true },
]
const map = suggestExcelColumnMapping(wb.excelLabels, importTypes)
ok(map['Карта "Платинум"'] === 'pl', 'suggest PL')
ok(map.ВИП2 === 'vip2' || map['ВИП2'] === 'vip2', 'suggest VIP2')
const imported = applyExcelImportToPriceListDocument(
  emptyPriceListDocument({ club_id: 'club-1' }),
  wb,
  map,
  importTypes,
)
ok(imported.applied > 0, 'import applied cells')
ok(imported.doc.cells['base:4:1:pl']?.price_10 === 2962, 'imported PL price_10')
ok(imported.doc.tariffs.some((t) => t.code === 'VIP2'), 'VIP2 tariff from import')

ok(formatPriceListMoney(2962) === '2 962', 'money spaced')
ok(formatPriceListMoney(null) === '—', 'money empty')
ok(priceListModePrintLabel('day') === 'Дневная скидка', 'mode day label')
ok(buildPriceListPngFileName({ clubId: 'abc', mode: 'base', validFrom: '2026-07-21' }).includes('base'), 'png name mode')
ok(buildPriceListPngFileName({ clubId: 'abc', mode: 'base', validFrom: '2026-07-21' }).endsWith('.png'), 'png ext')
ok(formatPriceListValidFromRu('2026-07-21') === '21.07.2026', 'valid_from ru')
const printHtml = buildPriceListPrintHtml(
  {
    club_id: 'c1',
    meta: { title: 'Персональный зал', address: 'Test', phone: '8-900' },
    tariffs: [{ membership_type_id: 'pl', code: 'PL', print_label: 'PL', sort_order: 0, is_vip: false }],
    sessions: [4],
    people: [1],
    cells: { 'base:4:1:pl': { price_full: 1000, price_10: 900 } },
  },
  { mode: 'base' },
)
ok(printHtml.includes('A4 landscape'), 'print html landscape page')
ok(printHtml.includes('PL') && printHtml.includes('900'), 'print html has tariff prices')
ok(!printHtml.includes('<script'), 'print html without scripts')

ok(assertPriceListClubAccess({ isAdmin: true }, 'club-1').ok === true, 'admin any club read')
ok(assertPriceListClubAccess({ isAdmin: true, isSalesManager: true, salesClubId: 'club-2' }, 'club-1').ok === true, 'admin overrides manager club scope')
ok(assertPriceListClubAccess({ isSalesManager: true, salesClubId: 'club-1' }, 'club-1').ok === true, 'manager own club read')
ok(assertPriceListClubAccess({ isSalesManager: true, profile: { club_id: 'club-1' } }, 'club-1').ok === true, 'manager club from profile')
ok(assertPriceListClubAccess({ isSalesManager: true, salesClubId: 'club-1' }, 'club-2').ok === false, 'manager other club denied')
ok(assertPriceListClubAccess({}, 'club-1').ok === false, 'no role denied')
ok(assertPriceListClubAccess({ isSalesManager: true }, '').ok === false, 'empty club_id rejected')

ok(assertPriceListWriteAccess({ isAdmin: true }, 'club-9').ok === true, 'admin write any club')
ok(assertPriceListWriteAccess({ isSalesManager: true, salesClubId: 'club-1' }, 'club-1').ok === true, 'manager write own club')
ok(assertPriceListWriteAccess({ isSalesManager: true, salesClubId: 'club-1' }, 'club-2').ok === false, 'manager write other club denied')

process.exit(failed > 0 ? 1 : 0)
