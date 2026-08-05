/**
 * node scripts/verify-trainer-journal-clients.mjs
 */
import {
  buildJournalClientsById,
  journalClientCardNumber,
  journalClientDisplayName,
} from '../src/lib/trainer/trainerJournalClientsCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    console.error(`FAIL: ${msg}`)
    failed++
  }
}

const active = [{ id: 'a1', name: 'Активный', card_number: '111' }]
const archived = [
  {
    id: '15774890-4114-4c62-a836-a836e2c3fe09',
    name: 'Бирюкова Алла',
    card_number: '5342',
    archived_at: '2026-08-04T12:00:00.000Z',
  },
]

const map = buildJournalClientsById(active, archived)
ok(map.a1?.name === 'Активный', 'active in map')
ok(map['15774890-4114-4c62-a836-a836e2c3fe09']?.name === 'Бирюкова Алла', 'archived in map')
ok(
  journalClientDisplayName(map, '15774890-4114-4c62-a836-a836e2c3fe09') === 'Бирюкова Алла',
  'display archived name',
)
ok(journalClientCardNumber(map, '15774890-4114-4c62-a836-a836e2c3fe09') === '5342', 'archived card')
ok(journalClientDisplayName(map, 'missing-id') === 'Клиент недоступен', 'missing not uuid')
ok(
  journalClientDisplayName(
    { x: { id: 'x', archived_at: '2026-01-01', name: '' } },
    'x',
  ) === 'Клиент в архиве',
  'archived empty name label',
)
ok(journalClientDisplayName({}, '') === '—', 'empty id')

// active overrides archived if same id (extra merge order)
const both = buildJournalClientsById(
  [{ id: 'same', name: 'Живой', card_number: '1' }],
  [{ id: 'same', name: 'Старый', card_number: '2', archived_at: 't' }],
)
ok(both.same?.name === 'Живой', 'active wins over archived on same id')

if (failed) process.exit(1)
console.log('verify-trainer-journal-clients: all ok')
