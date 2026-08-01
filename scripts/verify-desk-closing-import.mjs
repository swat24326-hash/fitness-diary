/**
 * node scripts/verify-desk-closing-import.mjs
 */
import {
  HOLDING_TRAINER_DISPLAY_NAME,
  isHoldingTrainerUser,
  mapClosingHeader,
  parseClosingAgreementsAoA,
  parseClosingDateCell,
  parseClosingPriceCell,
  planDeskClosingImport,
  scopeClosingRowsToHall,
} from '../src/lib/admin/deskClosingImportCore.js'

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
ok(mapClosingHeader('ФИО') === 'name', 'header name')
ok(mapClosingHeader('Дата окончания') === 'end', 'header end')
ok(mapClosingHeader('Телефон') === 'phone', 'header phone')
ok(mapClosingHeader('Цена') === 'price', 'header price')
ok(mapClosingHeader('Стоимость') === 'price', 'header price synonym')
ok(parseClosingPriceCell('12 500') === 12500, 'price spaces')
ok(parseClosingPriceCell('9900,5') === 9900.5, 'price comma')

ok(parseClosingDateCell('21.09.2026') === '2026-09-21', 'date dmy')
ok(parseClosingDateCell('2026-09-21') === '2026-09-21', 'date iso')

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
ok(planNew.counts.create === 2, 'create 2 new')
ok(planNew.actions.every((a) => a.action === 'create'), 'all create')

const planSkip = planDeskClosingImport({
  parsedRows: parsed.rows,
  clients: [{ id: 'c1', card_number: '5426', name: 'X' }],
  membershipsByClientId: {
    c1: [{ end_date: '2026-09-21', total_trainings: 8, used_trainings: 0 }],
  },
})
ok(planSkip.actions.find((a) => a.cardNumber === '5426')?.action === 'skip', 'skip existing')
ok(planSkip.actions.find((a) => a.cardNumber === '5678')?.action === 'create', 'other still create')

const conflict = planDeskClosingImport({
  parsedRows: [parsed.rows[0]],
  clients: [
    { id: 'a', card_number: '5426' },
    { id: 'b', card_number: '5426' },
  ],
})
ok(conflict.counts.conflict === 1, 'conflict')
ok(conflict.actions[0].reason.includes('Два'), 'conflict reason ru')

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
