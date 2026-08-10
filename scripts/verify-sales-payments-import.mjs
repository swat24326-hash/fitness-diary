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
  assertClubCardAvailableForCreate,
  looksLikeSalesCardNumber,
  matchClientByCardThenPhone,
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

const matchByName = matchClientsByCardNumber(
  [
    { id: 'z', card_number: '5775', name: 'Зайцев Артем' },
    { id: 's1', card_number: '5775', name: 'Шведов Даниил Дмитриевич' },
    { id: 's2', card_number: '5775', name: 'Шведов Даниил Дмитриевич' },
  ],
  '5775',
  { paymentName: 'Шведов Даниил Дмитриевич', preferOperational: true },
)
ok(matchByName.status === 'conflict' && matchByName.matches.length === 2, 'name narrows but two Шведов remain')

const matchOneByName = matchClientsByCardNumber(
  [
    { id: 'z', card_number: '5775', name: 'Зайцев Артем' },
    { id: 's1', card_number: '5775', name: 'Шведов Даниил' },
  ],
  '5775',
  { paymentName: 'Шведов Даниил Дмитриевич' },
)
ok(matchOneByName.status === 'one' && matchOneByName.client?.id === 's1', 'name disambiguates to one')

const matchArchived = matchClientsByCardNumber(
  [{ id: 'c-arch', card_number: '9001', name: 'Архивный', archived_at: '2026-01-01T00:00:00.000Z' }],
  '9001',
  { preferOperational: true },
)
ok(matchArchived.status === 'archived' && matchArchived.client?.id === 'c-arch', 'only archive → archived status')

const matchPreferLive = matchClientsByCardNumber(
  [
    { id: 'c-live', card_number: '9002', name: 'Живой' },
    { id: 'c-old', card_number: '9002', name: 'Старый', archived_at: '2026-01-01T00:00:00.000Z' },
  ],
  '9002',
  { preferOperational: true },
)
ok(matchPreferLive.status === 'one' && matchPreferLive.client?.id === 'c-live', 'prefer live over archive')

const archivedEnrich = enrichSalesPaymentLines({
  lines: [{ id: 'a1', hall: 'pz', cardNumber: '9001', name: 'Архивный', amount: 1000, tariffName: '8/1' }],
  reportDate: '2026-08-10',
  clients: [{ id: 'c-arch', card_number: '9001', name: 'Архивный', archived_at: '2026-01-01T00:00:00.000Z' }],
  membershipsByClientId: {},
})
ok(archivedEnrich[0]?.matchStatus === 'archived', 'enrich keeps archived status')
ok(archivedEnrich[0]?.clientId === 'c-arch', 'enrich keeps archived clientId')

const matchTwoArchived = matchClientsByCardNumber(
  [
    { id: 'a1', card_number: '9010', name: 'А один', archived_at: '2026-01-01T00:00:00.000Z' },
    { id: 'a2', card_number: '9010', name: 'А два', archived_at: '2026-02-01T00:00:00.000Z' },
  ],
  '9010',
  { preferOperational: true },
)
ok(matchTwoArchived.status === 'conflict', 'two archived same card → conflict (не угадываем)')

const matchArchivedByName = matchClientsByCardNumber(
  [
    { id: 'a1', card_number: '9011', name: 'Иванов Иван', archived_at: '2026-01-01T00:00:00.000Z' },
    { id: 'a2', card_number: '9011', name: 'Петров Пётр', archived_at: '2026-01-01T00:00:00.000Z' },
  ],
  '9011',
  { preferOperational: true, paymentName: 'Иванов Иван Сергеевич' },
)
ok(
  matchArchivedByName.status === 'archived' && matchArchivedByName.client?.id === 'a1',
  'name disambiguates two archived → one restore candidate',
)

const createBlockedByArchive = assertClubCardAvailableForCreate(
  [{ id: 'c-arch', club_id: 'club1', card_number: '9001', name: 'Архивный', archived_at: '2026-01-01' }],
  'club1',
  '9001',
)
ok(!createBlockedByArchive.ok, 'create blocked when only archived holds the card')
ok(String(createBlockedByArchive.error || '').includes('архиве'), 'create error mentions archive')

const cascadeArchived = matchClientByCardThenPhone({
  clients: [{ id: 'c-arch', card_number: '9001', name: 'Архивный', archived_at: '2026-01-01T00:00:00.000Z' }],
  cardNumber: '9001',
  preferOperational: true,
})
ok(cascadeArchived.status === 'archived' && cascadeArchived.matchedBy === 'card', 'cascade returns archived')

const archivedWithHalls = enrichSalesPaymentLines({
  lines: [{ id: 'a2', hall: 'pz', cardNumber: '9001', name: 'Архивный', amount: 1, tariffName: '8/1' }],
  reportDate: '2026-08-10',
  clients: [{ id: 'c-arch', card_number: '9001', name: 'Архивный', archived_at: '2026-01-01T00:00:00.000Z', trainer_id: 't1' }],
  membershipsByClientId: {
    'c-arch': [{ start_date: '2025-01-01', end_date: '2025-06-01', hall: 'pz', total_trainings: 8, used_trainings: 8 }],
  },
})
ok(archivedWithHalls[0]?.matchStatus === 'archived', 'enrich archived with old PZ mem')
ok(archivedWithHalls[0]?.matchedHalls?.includes('pz'), 'enrich matchedHalls includes pz for restore-only')

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

const crossEnrich = enrichSalesPaymentLines({
  lines: [{ id: 'x', hall: 'tz', cardNumber: '7199', name: 'Цымбал', amount: 1, tariffName: '' }],
  reportDate: '2026-07-31',
  clients: [{ id: 'c-pz', card_number: '7199', name: 'Цымбал', trainer_id: 't1', desk_hall: null }],
})
ok(crossEnrich[0]?.matchStatus === 'one', 'enrich finds PZ card')
ok(crossEnrich[0]?.matchedHallKind === 'pz', 'enrich matchedHallKind = pz for TZ line')

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
