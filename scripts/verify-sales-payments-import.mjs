/**
 * node scripts/verify-sales-payments-import.mjs
 */
import {
  buildDailyFormFromPaymentLines,
  detectSalesHallFromLabel,
  enrichSalesPaymentLines,
  parseImportMoney,
  parsePaymentsReportDate,
  parseSalesPaymentsAoA,
  suggestImportProfitBucket,
  tryParseClientSaleRow,
} from '../src/lib/admin/salesPaymentsImportCore.js'
import {
  looksLikeSalesCardNumber,
  matchClientsByCardNumber,
  normalizeSalesCardNumber,
} from '../src/lib/admin/salesClientMatchCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(normalizeSalesCardNumber(' № 5426 ') === '5426', 'normalize card')
ok(looksLikeSalesCardNumber('5426'), 'looks like card digits')
ok(looksLikeSalesCardNumber('р247'), 'looks like card letter+digits')
ok(!looksLikeSalesCardNumber('Сковпень Анастасия'), 'fio not card')

ok(detectSalesHallFromLabel('Персональный зал') === 'pz', 'hall pz')
ok(detectSalesHallFromLabel('Тренажерный зал') === 'tz', 'hall tz')
ok(detectSalesHallFromLabel('Аэробный зал') === 'az', 'hall az')
ok(detectSalesHallFromLabel('Клубная карта') === 'dop', 'hall dop')

ok(parseImportMoney('18 360,00') === 18360, 'money spaces comma')
ok(parseImportMoney(3600) === 3600, 'money number')

const sampleRows = [
  ['Отчет по оплатам'],
  ['Параметры:', 'Период: 31.07.2026 - 31.07.2026'],
  ['Продажа', 100, 50, 150],
  ['Клубная карта', 500, 500],
  [5829, 'Сковпень Анастасия', 500, 500],
  ['Запецкая Мария', 500],
  ['Аэробный зал', 1000, 1000],
  ['10 занятий Бокс', 3600, 3600],
  [5802, 'Фролов Евгений', 3600, 3600],
  ['Запецкая Мария', 'Аэробный зал', 3600],
  ['Персональный зал', 10000, 5000, 15000],
  ['8/1 VIP 2', 18360, 18360],
  [5426, 'Голованома Мария', 18360, 18360],
  ['Тренажерный зал', 5000, 4580, 9580],
  ['Тренажерный зал без лимита', 5000, 5000],
  [5678, 'Брага Татьяна', 5000, 5000],
  ['Итого', 78825, 37121, 115946],
]

ok(parsePaymentsReportDate(sampleRows) === '2026-07-31', 'report date')

const parsed = parseSalesPaymentsAoA(sampleRows)
ok(parsed.lines.length === 4, `parsed 4 sale lines (got ${parsed.lines.length})`)
ok(parsed.fileTotal === 115946, 'file total')
ok(parsed.lines.some((l) => l.cardNumber === '5426' && l.hall === 'pz'), 'VIP line pz')
ok(parsed.lines.some((l) => l.cardNumber === '5802' && l.hall === 'az'), 'box line az')
ok(parsed.lines.some((l) => l.cardNumber === '5678' && l.hall === 'tz'), 'tz line')
ok(parsed.lines.some((l) => l.cardNumber === '5829' && l.hall === 'dop'), 'club card dop')

const clientRow = tryParseClientSaleRow([5426, 'Test User', 100, 100])
ok(clientRow?.amount === 100, 'tryParseClientSaleRow')

const matchOne = matchClientsByCardNumber(
  [{ id: 'c1', card_number: '5426', name: 'A' }],
  '5426',
)
ok(matchOne.status === 'one', 'match one')

const matchConflict = matchClientsByCardNumber(
  [
    { id: 'c1', card_number: '5426' },
    { id: 'c2', card_number: '5426' },
  ],
  '5426',
)
ok(matchConflict.status === 'conflict' && matchConflict.reason.includes('Два'), 'conflict reason')

const tzEmpty = suggestImportProfitBucket({
  hall: 'tz',
  saleDate: '2026-07-31',
  matchStatus: 'none',
})
ok(tzEmpty.bucket == null && !tzEmpty.confident, 'tz without client → no auto NK')

const dkSuggest = suggestImportProfitBucket({
  hall: 'pz',
  saleDate: '2026-07-31',
  matchStatus: 'one',
  clientId: 'c1',
  memList: [{ start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 8, used_trainings: 0 }],
  trainings: [],
})
ok(dkSuggest.bucket === 'dk' && dkSuggest.confident, 'usable mem → dk')

const clients = [
  {
    id: 'c-vip',
    card_number: '5426',
    name: 'Голованома',
  },
]
const enriched = enrichSalesPaymentLines({
  lines: parsed.lines,
  reportDate: '2026-07-31',
  clients,
  membershipsByClientId: {
    'c-vip': [{ start_date: '2026-01-01', end_date: '2026-08-01', total_trainings: 8, used_trainings: 0 }],
  },
})
const vip = enriched.find((l) => l.cardNumber === '5426')
ok(vip?.profitBucket === 'dk', 'enrich vip → dk')

const withBuckets = enriched.map((l) => {
  if (l.hall === 'dop') return l
  if (l.profitBucket) return l
  return { ...l, profitBucket: 'nk' }
})
const built = buildDailyFormFromPaymentLines(withBuckets)
ok(Number(built.form.pz_dk) >= 1 || Number(built.form.pz_nk) >= 1, 'form has pz count')
ok(Number(built.form.dop_sum) === 500, `dop_sum 500 got ${built.form.dop_sum}`)
ok(built.needBucket === 0, 'all buckets set in test')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll sales payments import checks passed')
