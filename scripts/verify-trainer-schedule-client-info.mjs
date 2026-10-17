import {
  buildScheduleClientInfoById,
  buildScheduleEntryClientRows,
  formatScheduleClientCardMeta,
} from '../src/lib/trainer/trainerScheduleClientInfoCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

ok(formatScheduleClientCardMeta({ cardNumber: '4521', membershipLabel: 'ТЗ' }) === '№4521 · ТЗ', 'meta both')
ok(formatScheduleClientCardMeta({ cardNumber: '4521' }) === '№4521', 'meta card only')
ok(formatScheduleClientCardMeta({ membershipLabel: 'АЗ' }) === 'АЗ', 'meta type only')
ok(formatScheduleClientCardMeta({}) === '', 'meta empty')

const types = [{ id: 't1', code: 'ТЗ' }, { id: 't2', code: 'АЗ' }]
const clients = [
  { id: 'c1', name: 'Листратенко Валентин Юрьевич', card_number: '4521' },
  { id: 'c2', name: 'Иванов Иван', card_number: '' },
]
const mems = {
  c1: [{ id: 'm1', membership_type_id: 't1', start_date: '2026-01-01', end_date: '2026-12-31', total_trainings: 10, used_trainings: 1 }],
  c2: [],
}
const info = buildScheduleClientInfoById(clients, mems, types, '2026-10-17')
ok(info.c1?.cardNumber === '4521' && info.c1?.membershipLabel === 'ТЗ', 'info: card + type')
ok(info.c2?.membershipLabel === '', 'info: no membership')

const entry = { client_ids: ['c1'], title: '' }
const names = { c1: 'Листратенко Валентин Юрьевич' }
const wide = buildScheduleEntryClientRows(entry, names, info, { short: false, withMeta: true })
ok(wide.length === 1 && wide[0].name === 'Листратенко Валентин Юрьевич', 'rows: full name on wide')
ok(wide[0].meta === '№4521 · ТЗ', 'rows: meta on wide')
const narrow = buildScheduleEntryClientRows(entry, names, info, { short: true, withMeta: false })
ok(narrow[0].name === 'Листратенко В. Ю.' && narrow[0].meta === '', 'rows: short without meta in narrow')
ok(
  buildScheduleEntryClientRows({ client_ids: [], title: 'Обед' }, {}, {}, { withMeta: true })[0].name === 'Обед',
  'rows: note title',
)

console.log('verify-trainer-schedule-client-info: all ok')
