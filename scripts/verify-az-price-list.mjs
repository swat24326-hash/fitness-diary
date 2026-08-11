/**
 * Verify AZ price core + Excel fixture.
 * node scripts/verify-az-price-list.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addAzDirection,
  azPriceListCellKey,
  emptyAzPriceListDocument,
  getAzPriceListCell,
  parseAzMoney,
  parseAzSessions,
  parseAzValidFrom,
  seedAzPriceListDefaults,
  setAzPriceListCell,
  slugAzDirection,
} from '../src/lib/priceList/azPriceListCore.js'
import { importAzPriceListFromExcelBuffer } from '../src/lib/priceList/azPriceListExcelWorkbook.js'
import { azPriceListDocFromDbRow, azPriceListDocToDbRow } from '../src/lib/priceList/azPriceListDbCore.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0

function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(parseAzMoney('1 810') === 1810, 'money spaces')
ok(parseAzMoney('200руб') === 200, 'money руб')
ok(parseAzSessions('8') === 8, 'sessions 8')
ok(parseAzValidFrom('Цены действительны с 21.07.2026') === '2026-07-21', 'valid_from')
ok(slugAzDirection('Результат1+') === 'r1plus', 'slug r1plus')
ok(slugAzDirection('Йога') === 'yoga', 'slug yoga')
ok(azPriceListCellKey(4, 'r1plus') === '4:r1plus', 'cell key')

const buf = readFileSync(join(root, 'scripts/fixtures/az-price-1kfs.xlsx'))
const res = importAzPriceListFromExcelBuffer(buf, { clubId: 'club-test' })
ok(res.ok, `import ok (${res.error || ''})`)
ok(res.doc?.result_directions?.length === 3, `result dirs = 3 (got ${res.doc?.result_directions?.length})`)
ok(res.doc?.class_directions?.length === 3, `class dirs = 3 (got ${res.doc?.class_directions?.length})`)
ok(JSON.stringify(res.doc?.session_counts) === '[4,8,10]', 'sessions 4/8/10')

const r1 = getAzPriceListCell(res.doc, { sessions: 4, directionId: 'r1plus' })
ok(r1.price_full === 2011 && r1.price_10 === 1810, 'r1plus 4')
const yoga = getAzPriceListCell(res.doc, { sessions: 8, directionId: 'yoga' })
ok(yoga.price_full === 4433 && yoga.price_10 === 3990, 'yoga 8')
const box10 = getAzPriceListCell(res.doc, { sessions: 10, directionId: 'box' })
ok(box10.price_full === 4000 && box10.price_10 === 3600, 'box 10')

ok(res.doc.extras.result_plus === 730, 'result_plus 730')
ok(res.doc.extras.one_time_result_plus === 750, 'one_time 750')
ok(res.doc.extras.evening_pt_surcharge === 100, 'evening pt 100')
ok(res.doc.extras.other_fees?.length === 5, 'other fees 5')
ok(res.doc.valid_from === '2026-07-21', 'valid_from iso')
ok(/Клинцы/i.test((res.doc.meta.address_lines || []).join(' ')), 'address Klinzy')

const row = azPriceListDocToDbRow(res.doc, 'club-test', 'user-1')
ok(Array.isArray(row.result_directions) && row.result_directions.length === 3, 'db row directions')
const round = azPriceListDocFromDbRow(row, 'club-test')
ok(getAzPriceListCell(round, { sessions: 4, directionId: 'r3plus' }).price_full === 3498, 'db roundtrip r3')

const seeded = seedAzPriceListDefaults(emptyAzPriceListDocument({ club_id: 'c2' }), { replace: true })
ok(seeded.result_directions.length === 3, 'seed result dirs')
ok(seeded.class_directions.length === 3, 'seed class dirs')
ok(JSON.stringify(seeded.session_counts) === '[4,8,10]', 'seed sessions')

const linked = setAzPriceListCell(seeded, { sessions: 4, directionId: 'r1plus', price_full: 2000 })
ok(getAzPriceListCell(linked, { sessions: 4, directionId: 'r1plus' }).price_10 === 1800, 'link −10%')
const withDir = addAzDirection(linked, 'classes', { label: 'Пилатес' })
ok(withDir.class_directions.some((d) => /пилатес/i.test(d.label)), 'add class direction')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll AZ price list checks passed')
