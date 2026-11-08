/**
 * Группа АЗ: кто закрепляет, полоса, «Прочитали N из M», окно читателей.
 * node scripts/verify-az-group-pin.mjs
 */
import { azGroupParticipantKey } from '../src/lib/chat/azGroupCore.js'
import {
  azGroupReaders,
  azGroupSeenCount,
  azGroupSeenRu,
  buildAzGroupPinned,
  canPinAzGroup,
} from '../src/lib/chat/azGroupPinCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const INST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CLIENT_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CLIENT_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

ok(canPinAzGroup({ kind: 'instructor', userId: INST }, INST), 'инструктор своего чата закрепляет')
ok(!canPinAzGroup({ kind: 'instructor', userId: 'other' }, INST), 'чужой инструктор не закрепляет')
ok(!canPinAzGroup({ kind: 'client', clientId: CLIENT_A }, INST), 'клиент не закрепляет')
ok(!canPinAzGroup({ kind: 'instructor', userId: INST }, ''), 'без инструктора — нет')

const text = buildAzGroupPinned(
  { id: 'm1', body: 'Завтра бокс в 19:00', sticker: null, mine: false, author_name: 'Олег' },
  '2026-11-03T10:00:00Z',
)
ok(text?.id === 'm1' && text.text === 'Завтра бокс в 19:00' && text.pinned_at === '2026-11-03T10:00:00Z', 'закреп: id, текст, время')
ok(buildAzGroupPinned({ id: 'm2', body: 'x', sticker: 'kettle-hi', mine: true }, null)?.text === 'Стикер', 'стикер — «Стикер»')
ok(buildAzGroupPinned(null, null) === null, 'нет сообщения — нет полосы')

const members = [
  { id: INST, side: 'user', name: 'Олег' },
  { id: CLIENT_A, side: 'client', name: 'Анна' },
  { id: CLIENT_B, side: 'client', name: 'Борис' },
]
const msg = {
  id: 'm1',
  author_side: 'user',
  author_user_id: INST,
  created_at: '2026-11-03T10:00:00.000Z',
}
const reads = [
  { participant: azGroupParticipantKey({ side: 'user', userId: INST }), read_at: '2026-11-03T10:00:00.000Z' },
  { participant: azGroupParticipantKey({ side: 'client', clientId: CLIENT_A }), read_at: '2026-11-03T10:00:00+00:00' },
  { participant: azGroupParticipantKey({ side: 'client', clientId: CLIENT_B }), read_at: '2026-11-03T09:59:00.000Z' },
]
const seen = azGroupSeenCount(msg, members, reads)
ok(seen.seen === 1 && seen.total === 2, `прочитал 1 из 2 клиентов (${seen.seen}/${seen.total})`)
ok(azGroupSeenCount(msg, members, []).seen === 0, 'никто не открывал — 0')

const names = new Map([[azGroupParticipantKey({ side: 'client', clientId: CLIENT_A }), 'Анна Петрова']])
const list = azGroupReaders(msg, members, reads, names)
ok(JSON.stringify(list.read) === JSON.stringify([{ id: CLIENT_A, side: 'client', name: 'Анна Петрова' }]), 'прочитали: имя из карты')
ok(JSON.stringify(list.unread.map((p) => p.name)) === '["Борис"]', 'не прочитали: без автора')

ok(azGroupSeenRu({ seen: 0, total: 2 }) === 'Пока никто не прочитал', '0 из 2')
ok(azGroupSeenRu({ seen: 1, total: 2 }) === 'Прочитал 1 из 2', '1 из 2')
ok(azGroupSeenRu({ seen: 2, total: 2 }) === 'Прочитали все 2', 'все')
ok(azGroupSeenRu({ seen: 0, total: 0 }) === 'В чате пока никого нет', 'кроме автора никого')

if (failed) {
  console.error(`\nverify-az-group-pin: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-az-group-pin: ok')
