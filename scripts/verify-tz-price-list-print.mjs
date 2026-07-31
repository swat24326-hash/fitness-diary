/**
 * Verify TZ price list print HTML + PNG names.
 * node scripts/verify-tz-price-list-print.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importTzPriceListFromExcelBuffer } from '../src/lib/priceList/tzPriceListExcelWorkbook.js'
import {
  buildTzPriceListPngFileName,
  buildTzPriceListPrintBasement,
  buildTzPriceListPrintCap,
  buildTzPriceListPrintSheets,
} from '../src/lib/priceList/tzPriceListPrintChrome.js'
import { buildTzPriceListPrintHtml } from '../src/lib/priceList/tzPriceListPrintHtml.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const buf = readFileSync(join(root, 'scripts/fixtures/tz-price-1kfs.xls'))
const res = importTzPriceListFromExcelBuffer(buf, { clubId: 'club-test' })
ok(res.ok, `fixture import (${res.error || ''})`)

const sheets = buildTzPriceListPrintSheets(res.doc)
ok(sheets.length === 2, `2 sheets (got ${sheets.length})`)
ok(sheets[0].slug === 'month1' && sheets[0].sheetLabel === '1 месяц', 'sheet month1')
ok(sheets[1].slug === 'promo' && sheets[1].sheetLabel === 'Акции', 'sheet promo')

const onlyMonth = buildTzPriceListPrintSheets({
  ...res.doc,
  promo_rows: [],
})
ok(onlyMonth.length === 1 && onlyMonth[0].slug === 'month1', 'only month1')

const onlyPromo = buildTzPriceListPrintSheets({
  ...res.doc,
  month1_rows: [],
})
ok(onlyPromo.length === 1 && onlyPromo[0].slug === 'promo', 'only promo')

ok(buildTzPriceListPrintSheets({ month1_rows: [], promo_rows: [] }).length === 0, 'empty sheets')

const cap = buildTzPriceListPrintCap(res.doc, { sheetLabel: '1 месяц', hoursNote: 'часы' })
ok(/Клинцы|Тренаж/i.test(cap.title + cap.address), 'cap title/address')
ok(cap.sheetLabel === '1 месяц', 'cap sheet label')
ok(cap.hoursNote === 'часы', 'cap hours')

const basement = buildTzPriceListPrintBasement(res.doc)
ok(/750/.test(basement.oneTimeLine), 'basement one_time 750')
ok(/500/.test(basement.clubCardLine), 'basement club_card 500')
ok(/25\.01\.2026/.test(basement.validLine), 'basement valid_from')

const html = buildTzPriceListPrintHtml(res.doc)
ok(html.includes('1 месяц'), 'html has 1 месяц')
ok(html.includes('Акции'), 'html has Акции')
ok(html.includes('База стенд'), 'html month1 cols')
ok(html.includes('Акция'), 'html promo cols')
ok(html.includes('1300') || html.includes('1\u00a0300') || html.includes('1 300'), 'html price stand')
ok(html.includes('2290') || html.includes('2\u00a0290') || html.includes('2 290'), 'html promo price')
ok(html.includes('Разовое занятие'), 'html one_time')
ok(html.includes('Клубная карта'), 'html club_card')
ok(!/<script\b/i.test(html), 'html without script')
ok(/A4 landscape/i.test(html), 'html A4 landscape')

const monthName = buildTzPriceListPngFileName({
  clubId: 'club-test',
  validFrom: '2026-01-25',
  sheetSlug: 'month1',
})
const promoName = buildTzPriceListPngFileName({
  clubId: 'club-test',
  validFrom: '2026-01-25',
  sheetSlug: 'promo',
})
ok(monthName === 'tz-price-club-test-month1-2026-01-25.png', `png month1 name (${monthName})`)
ok(promoName === 'tz-price-club-test-promo-2026-01-25.png', `png promo name (${promoName})`)

const emptyHtml = buildTzPriceListPrintHtml({ month1_rows: [], promo_rows: [] })
ok(/загрузите Excel|заполните сетку/i.test(emptyHtml), 'empty html hint')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll TZ price list print checks passed')
