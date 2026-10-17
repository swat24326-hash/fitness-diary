import {
  buildScheduleClientInfoById,
  buildScheduleEntryClientRows,
  formatScheduleClientCardMeta,
  pickMembershipForScheduleCardLabel,
  scheduleMembershipVisitsLabel,
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
ok(
  formatScheduleClientCardMeta({
    cardNumber: '5597',
    membershipLabel: 'R3+',
    visitsLabel: '5/13',
  }) === '№5597 · R3+ · 5/13',
  'meta with visits',
)
ok(
  formatScheduleClientCardMeta({
    cardNumber: '5597',
    membershipLabel: 'R3+',
    visitsLabel: '5/13',
    membershipEnded: true,
  }) === '№5597 · R3+ · 5/13 · вышел',
  'meta ended abon',
)

ok(scheduleMembershipVisitsLabel({ total_trainings: 13, used_trainings: 5 }) === '5/13', 'visits 5/13')
ok(scheduleMembershipVisitsLabel({ total_trainings: 0, used_trainings: 0 }) === '', 'visits unlimited empty')

const types = [
  { id: 't1', code: 'ТЗ' },
  { id: 't2', code: 'АЗ' },
  { id: 't3', code: 'R3+' },
]
const clients = [
  { id: 'c1', name: 'Листратенко Валентин Юрьевич', card_number: '4521' },
  { id: 'c2', name: 'Иванов Иван', card_number: '' },
  { id: 'c3', name: 'Абаева Светлана', card_number: '5597' },
]
const mems = {
  c1: [
    {
      id: 'm1',
      membership_type_id: 't1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      total_trainings: 10,
      used_trainings: 1,
    },
  ],
  c2: [],
  /* Как у Абаевой: последний абон вышел до «сегодня». */
  c3: [
    {
      id: 'm3',
      membership_type_id: 't3',
      start_date: '2026-08-05',
      end_date: '2026-09-05',
      total_trainings: 13,
      used_trainings: 5,
    },
  ],
}
const info = buildScheduleClientInfoById(clients, mems, types, '2026-10-17')
ok(info.c1?.cardNumber === '4521' && info.c1?.membershipLabel === 'ТЗ', 'info: card + type')
ok(info.c1?.visitsLabel === '1/10' && info.c1?.membershipEnded === false, 'info: visits active')
ok(info.c2?.membershipLabel === '', 'info: no membership')
ok(info.c3?.membershipLabel === 'R3+' && info.c3?.visitsLabel === '5/13', 'info: last ended type+visits')
ok(info.c3?.membershipEnded === true, 'info: ended flag')
ok(
  formatScheduleClientCardMeta(info.c3) === '№5597 · R3+ · 5/13 · вышел',
  'abaeva-style meta',
)

const picked = pickMembershipForScheduleCardLabel(mems.c3, '2026-10-17')
ok(picked?.id === 'm3', 'pick falls back to latest ended')

const entry = { client_ids: ['c1'], title: '' }
const names = { c1: 'Листратенко Валентин Юрьевич' }
const wide = buildScheduleEntryClientRows(entry, names, info, { short: false, withMeta: true })
ok(wide.length === 1 && wide[0].name === 'Листратенко Валентин Юрьевич', 'rows: full name on wide')
ok(wide[0].meta === '№4521 · ТЗ · 1/10', 'rows: meta with visits on wide')
const narrow = buildScheduleEntryClientRows(entry, names, info, { short: true, withMeta: false })
ok(narrow[0].name === 'Листратенко В. Ю.' && narrow[0].meta === '', 'rows: short without meta in narrow')
ok(
  buildScheduleEntryClientRows({ client_ids: [], title: 'Обед' }, {}, {}, { withMeta: true })[0].name === 'Обед',
  'rows: note title',
)

console.log('verify-trainer-schedule-client-info: all ok')
