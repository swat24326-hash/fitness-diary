/**
 * node scripts/verify-desk-closing-import.mjs
 */
import {
  HOLDING_TRAINER_DISPLAY_NAME,
  isHoldingTrainerUser,
  mapClosingHeader,
  parseClosingAgreementsAoA,
  parseClosingDateCell,
  planDeskClosingImport,
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

ok(parseClosingDateCell('21.09.2026') === '2026-09-21', 'date dmy')
ok(parseClosingDateCell('2026-09-21') === '2026-09-21', 'date iso')

const aoa = [
  ['№ карты', 'ФИО', 'Телефон', 'Зал', 'Тип', 'Дата окончания'],
  ['5426', 'Голованома Мария', '89001112233', 'ПЗ', 'VIP 2', '21.09.2026'],
  ['5678', 'Брага Татьяна', '', 'ТЗ', 'без лимита', '31.08.2026'],
  ['', 'без карты', '', 'ТЗ', 'x', '01.01.2026'],
]

const parsed = parseClosingAgreementsAoA(aoa)
ok(parsed.rows.length === 2, `2 rows got ${parsed.rows.length}`)
ok(parsed.rows[0].cardNumber === '5426' && parsed.rows[0].endDate === '2026-09-21', 'row0')

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

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nAll desk closing import checks passed')
