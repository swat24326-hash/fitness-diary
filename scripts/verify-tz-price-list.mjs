/**
 * Verify TZ price core + Excel fixture.
 * node scripts/verify-tz-price-list.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatTzSessionsLabel,
  parseTzMoney,
  parseTzMonths,
  parseTzSessions,
  parseTzValidFrom,
  recomputeTzPriceListDerived,
} from '../src/lib/priceList/tzPriceListCore.js'
import { importTzPriceListFromExcelBuffer } from '../src/lib/priceList/tzPriceListExcelWorkbook.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parseTzMoney('3,250') === 3250, 'money 3,250')
ok(parseTzMoney('5590*') === 5590, 'money with star')
ok(parseTzMoney('1 500') === 1500, 'money spaces')
ok(parseTzSessions('8 занятий') === 8, 'sessions 8')
ok(parseTzSessions('без лимита') == null, 'sessions unlimited')
ok(parseTzMonths('12мес') === 12, 'months 12')
ok(parseTzValidFrom('Цены действительны с 25.01.2026') === '2026-01-25', 'valid_from')
ok(formatTzSessionsLabel(null) === 'без лимита', 'label unlimited')

const buf = readFileSync(join(root, 'scripts/fixtures/tz-price-1kfs.xls'))
const res = importTzPriceListFromExcelBuffer(buf, { clubId: 'club-test' })
ok(res.ok, `import ok (${res.error || ''})`)
ok(res.doc?.month1_rows?.length === 3, `month1 rows = 3 (got ${res.doc?.month1_rows?.length})`)
ok(res.doc?.promo_rows?.length === 7, `promo rows = 7 (got ${res.doc?.promo_rows?.length})`)

const m1 = res.doc.month1_rows
ok(m1[0].sessions === 8 && m1[0].base_full === 2950 && m1[0].base_stand === 1300, '1м 8 занятий')
ok(m1[0].day_stand === 1000, '1м 8 day stand')
ok(m1[1].sessions === 10 && m1[1].base_stand === 1550, '1м 10 занятий')
ok(m1[2].sessions == null && m1[2].base_full === 3250 && m1[2].base_stand === 2290, '1м без лимита')

const p = res.doc.promo_rows
ok(p[0].months === 1 && p[0].promo === 2290, 'promo 1м')
ok(p[1].months === 2 && p[1].promo === 2990, 'promo 2м')
ok(p[6].months === 12 && p[6].promo === 13990, 'promo 12м')

ok(res.doc.extras.one_time === 750, 'one_time 750')
ok(res.doc.extras.club_card === 500, 'club_card 500')
ok(res.doc.valid_from === '2026-01-25', 'valid_from iso')
ok(/Клинцы/i.test(res.doc.meta.address || ''), 'address Klinzy')
ok(String(res.doc.meta.phone || '').includes('930'), 'phone')

const recomputed = recomputeTzPriceListDerived(res.doc)
ok(recomputed.month1_rows[0].base_save === 1650, 'recompute base_save')
ok(recomputed.promo_rows[0].month_cost === 2290, 'recompute month_cost 1м')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll TZ price list checks passed')
