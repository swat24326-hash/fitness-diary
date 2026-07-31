/**
 * Verify AZ price list print HTML + PNG names.
 * node scripts/verify-az-price-list-print.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importAzPriceListFromExcelBuffer } from '../src/lib/priceList/azPriceListExcelWorkbook.js'
import {
  buildAzPriceListPngFileName,
  buildAzPriceListPrintBasement,
  buildAzPriceListPrintCap,
  buildAzPriceListPrintSheets,
} from '../src/lib/priceList/azPriceListPrintChrome.js'
import { buildAzPriceListPrintHtml } from '../src/lib/priceList/azPriceListPrintHtml.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const buf = readFileSync(join(root, 'scripts/fixtures/az-price-1kfs.xlsx'))
const res = importAzPriceListFromExcelBuffer(buf, { clubId: 'club-test' })
ok(res.ok, `fixture import (${res.error || ''})`)

const sheets = buildAzPriceListPrintSheets(res.doc)
ok(sheets.length === 3, `3 sheets (got ${sheets.length})`)
ok(sheets[0].slug === 'result' && sheets[0].sheetLabel === 'Результат', 'sheet result')
ok(sheets[1].slug === 'classes' && sheets[1].sheetLabel === 'Групповые', 'sheet classes')
ok(sheets[2].slug === 'fees' && sheets[2].sheetLabel === 'Доплаты', 'sheet fees')

const onlyResult = buildAzPriceListPrintSheets({
  ...res.doc,
  class_directions: [],
  cells: Object.fromEntries(
    Object.entries(res.doc.cells).filter(([k]) => k.includes('r1plus') || k.includes('r2plus') || k.includes('r3plus')),
  ),
  extras: { ...res.doc.extras, other_fees: [], evening_pt_surcharge: null },
})
ok(onlyResult.length === 1 && onlyResult[0].slug === 'result', 'only result')

ok(buildAzPriceListPrintSheets({ result_directions: [], class_directions: [], cells: {}, extras: {} }).length === 0, 'empty sheets')

const cap = buildAzPriceListPrintCap(res.doc, { sheetLabel: 'Результат' })
ok(/групповых|Клинцы/i.test(cap.title + cap.address), 'cap title/address')
ok(cap.sheetLabel === 'Результат', 'cap sheet label')

const basement = buildAzPriceListPrintBasement(res.doc)
ok(/730/.test(basement.resultPlusLine), 'basement result_plus')
ok(/750/.test(basement.oneTimeLine), 'basement one_time')
ok(/21\.07\.2026/.test(basement.validLine), 'basement valid_from')

const html = buildAzPriceListPrintHtml(res.doc)
ok(html.includes('Результат'), 'html has Результат')
ok(html.includes('Групповые'), 'html has Групповые')
ok(html.includes('Доплаты'), 'html has Доплаты')
ok(html.includes('−10%') || html.includes('-10%'), 'html stand col')
ok(html.includes('2011') || html.includes('2 011'), 'html price r1')
ok(html.includes('Йога') || html.includes('йога'), 'html yoga')
ok(html.includes('Разовое Результат+') || html.includes('Результат+'), 'html extras')
ok(!/<script\b/i.test(html), 'html without script')
ok(/A4 landscape/i.test(html), 'html A4 landscape')

const name = buildAzPriceListPngFileName({
  clubId: 'club-test',
  validFrom: '2026-07-21',
  sheetSlug: 'result',
})
ok(name === 'az-price-club-test-result-2026-07-21.png', `png name (${name})`)
ok(
  buildAzPriceListPngFileName({
    clubId: 'club-test',
    validFrom: '2026-07-21',
    sheetSlug: 'fees',
  }) === 'az-price-club-test-fees-2026-07-21.png',
  'png fees name',
)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll AZ price list print checks passed')
