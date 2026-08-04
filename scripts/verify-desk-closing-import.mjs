/**
 * node scripts/verify-desk-closing-import.mjs
 */
import {
  HOLDING_TRAINER_DISPLAY_NAME,
  dedupeClosingRowsByCard,
  isHoldingTrainerUser,
  mapClosingHeader,
  parseClosingAgreementsAoA,
  parseClosingDateCell,
  parseClosingPackageMonths,
  parseClosingPriceCell,
  planDeskClosingImport,
  scopeClosingRowsToHall,
} from '../src/lib/admin/deskClosingImportCore.js'
import { resolveDeskMembershipDates } from '../src/lib/admin/deskMembershipLedgerCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

ok(isHoldingTrainerUser({ name: 'Не назначен' }), 'holding name')
ok(!isHoldingTrainerUser({ name: 'Семенов' }), 'not holding')
ok(HOLDING_TRAINER_DISPLAY_NAME === 'Не назначен', 'const name')

ok(mapClosingHeader('№ карты') === 'card', 'header card')
ok(mapClosingHeader('Клиент') === 'card', '1c client code = card')
ok(mapClosingHeader('ФИО') === 'name', 'header name')
ok(mapClosingHeader('Физическое лицо') === 'name', '1c person = name')
ok(mapClosingHeader('Дата окончания') === 'end', 'header end')
ok(mapClosingHeader('Абонемент.Факт окончание') === 'end', '1c end')
ok(mapClosingHeader('Телефон') === 'phone', 'header phone')
ok(mapClosingHeader('Цена') === 'price', 'header price')
ok(mapClosingHeader('Стоимость') === 'price', 'header price synonym')
ok(mapClosingHeader('Абонемент.Тип карты') === 'hall', '1c type card = hall')
ok(mapClosingHeader('Абонемент.Сотрудник') == null, '1c employee not type')
ok(mapClosingHeader('Срок') === 'duration', 'header duration')
ok(parseClosingPackageMonths('6 мес') === 6, 'parse 6 мес')
ok(parseClosingPackageMonths('1 месяц') === 1, 'parse 1 месяц')
ok(parseClosingPriceCell('12 500') === 12500, 'price spaces')
ok(parseClosingPriceCell('9900,5') === 9900.5, 'price comma')
ok(parseClosingPriceCell('2,000.00') === 2000, 'price us thousands')

ok(parseClosingDateCell('21.09.2026') === '2026-09-21', 'date dmy')
ok(parseClosingDateCell('31.08.2026 23:59:59') === '2026-08-31', 'date with time')
ok(parseClosingDateCell('2026-09-21') === '2026-09-21', 'date iso')

const aoa1c = [
  [
    'Клиент',
    'Физическое лицо',
    'Телефон мобильный',
    'Абонемент.Факт окончание',
    'Абонемент.Тип карты',
    'Абонемент.Цена',
    'Срок',
  ],
  ['1148', 'Афанасенко Елена', '89208479633', '31.08.2026 23:59:59', 'ТЗ', '2,000.00', '1 мес'],
  ['1654', 'Знаковская Оксана', '89208428331', '25.08.2026 23:59:59', 'АЗ', '6,755.00', ''],
  ['1702', 'Мисников Дмитрий', '', '25.08.2026 23:59:59', 'ТЗ Утро', '1,300.00', '6 мес'],
  ['164', 'Елисейкина Татьяна', '89208390419', '18.08.2026 23:59:59', 'ТЗ', '6,072.00', '6 мес'],
]
const parsed1c = parseClosingAgreementsAoA(aoa1c)
ok(parsed1c.rows.length === 4, '1c rows')
ok(parsed1c.rows[0].cardNumber === '1148' && parsed1c.rows[0].name.includes('Афанасенко'), '1c card+name')
ok(parsed1c.rows[0].endDate === '2026-08-31' && parsed1c.rows[0].paidAmount === 2000, '1c end+price')
ok(parsed1c.rows[0].hall === 'tz' && parsed1c.rows[1].hall === 'az', '1c hall tz/az')
ok(parsed1c.rows[2].hall === 'tz', '1c ТЗ Утро = tz')
ok(parsed1c.rows[3].packageMonths === 6, '1c package 6 мес')
ok(scopeClosingRowsToHall(parsed1c.rows, 'tz').length === 3, '1c scope tz')

const dates6 = resolveDeskMembershipDates('2026-08-20', null, 6)
ok(dates6?.start_date === '2026-02-20' && dates6?.end_date === '2026-08-20', 'dates from 6 мес inclusive')
ok(
  dedupeClosingRowsByCard([
    { cardNumber: '164', endDate: '2026-07-18', packageMonths: 1 },
    { cardNumber: '164', endDate: '2026-08-18', packageMonths: 6 },
  ]).length === 1,
  'dedupe by card keeps one',
)
ok(
  dedupeClosingRowsByCard([
    { cardNumber: '164', endDate: '2026-07-18', packageMonths: 1 },
    { cardNumber: '164', endDate: '2026-08-18', packageMonths: 6 },
  ])[0].packageMonths === 6,
  'dedupe keeps newer end + package',
)

const aoa = [
  ['№ карты', 'ФИО', 'Телефон', 'Зал', 'Тип', 'Дата окончания', 'Цена'],
  ['5426', 'Голованома Мария', '89001112233', 'ПЗ', 'VIP 2', '21.09.2026', '15000'],
  ['5678', 'Брага Татьяна', '', 'ТЗ', 'без лимита', '31.08.2026', ''],
  ['', 'без карты', '', 'ТЗ', 'x', '01.01.2026', '0'],
]

const parsed = parseClosingAgreementsAoA(aoa)
ok(parsed.rows.length === 2, `2 rows got ${parsed.rows.length}`)
ok(parsed.rows[0].cardNumber === '5426' && parsed.rows[0].endDate === '2026-09-21', 'row0')
ok(parsed.rows[0].paidAmount === 15000, 'row0 price')
ok(parsed.rows[1].paidAmount == null, 'row1 empty price')

const planNew = planDeskClosingImport({
  parsedRows: parsed.rows,
  clients: [],
  membershipsByClientId: {},
})
ok(planNew.counts.create === 1, 'create only TZ (PZ skipped — no desk hall)')
ok(planNew.counts.skip === 1, 'skip PZ without tz/az')
ok(planNew.actions.find((a) => a.cardNumber === '5678')?.action === 'create', 'tz create')
ok(planNew.actions.find((a) => a.cardNumber === '5426')?.action === 'skip', 'pz skip')
ok(planNew.counts.hallTz === 1 && planNew.counts.hallAz === 0, 'hall counts from file')

const planMixed = planDeskClosingImport({
  parsedRows: parsed1c.rows,
  clients: [],
  membershipsByClientId: {},
})
ok(planMixed.counts.create === 4, '1c mixed create all with hall')
ok(planMixed.counts.hallTz === 3 && planMixed.counts.hallAz === 1, '1c hallTz/hallAz')
ok(
  planMixed.actions.filter((a) => a.action === 'create' && a.hall === 'tz').length === 3,
  '1c creates stamp tz',
)
ok(
  planMixed.actions.find((a) => a.cardNumber === '164')?.packageMonths === 6,
  '1c create keeps packageMonths 6',
)
ok(
  planMixed.actions.some((a) => a.action === 'create' && a.hall === 'az'),
  '1c creates stamp az',
)

const planSkip = planDeskClosingImport({
  parsedRows: parsed.rows.filter((r) => r.hall === 'tz' || r.hall === 'az'),
  clients: [{ id: 'c1', card_number: '5678', name: 'X' }],
  membershipsByClientId: {
    c1: [{ end_date: '2026-08-31', total_trainings: 8, used_trainings: 0 }],
  },
})
ok(
  planSkip.actions.some((a) => a.cardNumber === '5678' && a.action === 'skip'),
  'skip existing tz',
)
ok(planSkip.counts.create === 0, 'no create when client exists')

const dupCards = planDeskClosingImport({
  parsedRows: [parsed.rows.find((r) => r.cardNumber === '5678')],
  clients: [
    { id: 'a', card_number: '5678' },
    { id: 'b', card_number: '5678' },
  ],
})
ok(dupCards.counts.conflict === 0, 'desk import resolves duplicate cards')
ok(
  dupCards.actions.some((a) => a.action === 'skip' || a.action === 'tag_hall'),
  'duplicate cards → skip/tag not conflict',
)

const tzOnly = scopeClosingRowsToHall(parsed.rows, 'tz')
const tagPlan = planDeskClosingImport({
  parsedRows: tzOnly,
  clients: [{ id: 'c1', card_number: '5678', name: 'X', desk_hall: null }],
  membershipsByClientId: {
    c1: [{ end_date: '2026-08-31', total_trainings: 0, used_trainings: 0 }],
  },
})
ok((tagPlan.counts.tagHall ?? 0) === 1, 'tag_hall when desk_hall empty')
ok(tagPlan.actions.some((a) => a.action === 'tag_hall' && a.hall === 'tz'), 'tag_hall tz')

const stamped = scopeClosingRowsToHall(
  [
    { cardNumber: '1', hall: null },
    { cardNumber: '2', hall: null },
  ],
  'tz',
)
ok(stamped.every((r) => r.hall === 'tz'), 'stamp tz when no hall col')

const filtered = scopeClosingRowsToHall(
  [
    { cardNumber: '1', hall: 'tz' },
    { cardNumber: '2', hall: 'az' },
    { cardNumber: '3', hall: null },
  ],
  'tz',
)
ok(filtered.length === 2 && filtered.every((r) => r.hall === 'tz'), 'filter tz + fill empty')

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll desk closing import checks passed')
