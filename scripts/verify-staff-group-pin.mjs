/**
 * Чат клуба, как в группах Telegram: кто закрепляет, полоса закрепа, «Прочитали N из M», окно «Кто прочитал», ✓✓ без админа.
 * node scripts/verify-staff-group-pin.mjs
 */
import { staffGroupPeerReadAt } from '../src/lib/chat/staffGroupCore.js'
import {
  buildStaffGroupPinned,
  canPinStaffGroup,
  staffGroupReaders,
  staffGroupSeenCount,
  staffGroupSeenRu,
} from '../src/lib/chat/staffGroupPinCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

ok(canPinStaffGroup({ role: 'supervisor' }), 'управляющий закрепляет')
ok(canPinStaffGroup({ role: 'управляющий' }), 'управляющий кириллицей — тоже')
ok(canPinStaffGroup({ role: 'admin' }), 'главный админ закрепляет')
ok(!canPinStaffGroup({ role: 'trainer' }), 'тренер не закрепляет')
ok(!canPinStaffGroup({ role: 'sales_manager' }), 'менеджер не закрепляет')
ok(!canPinStaffGroup({ role: '' }) && !canPinStaffGroup(null), 'пустая роль — нет')

const text = buildStaffGroupPinned({ id: 'm1', body: 'Правила смены: открываем в 7:00', sticker: null, mine: false, author_name: 'Ольга' }, '2026-10-14T10:00:00Z')
ok(text?.id === 'm1' && text.text === 'Правила смены: открываем в 7:00' && text.pinned_at === '2026-10-14T10:00:00Z', 'закреп: id, текст, время')
ok(buildStaffGroupPinned({ id: 'm2', body: 'x', sticker: 'kettle-hi', mine: true }, null)?.text === 'Стикер', 'закреплённый стикер — «Стикер»')
ok(buildStaffGroupPinned({ id: 'm3', body: 'а'.repeat(300), sticker: null }, null).text.length <= 101, 'длинный текст — укорочен, как в цитате')
ok(buildStaffGroupPinned(null, null) === null, 'нет сообщения — нет полосы')

const members = [
  { id: 'sup', name: 'Ольга' },
  { id: 't1', name: 'Борис' },
  { id: 't2', name: 'Анна' },
  { id: 's1', name: 'Пётр' },
]
const msg = { id: 'm1', author_user_id: 'sup', created_at: '2026-10-14T10:00:00.000Z' }
const reads = [
  { user_id: 'sup', read_at: '2026-10-14T10:00:00.000Z' },
  { user_id: 't1', read_at: '2026-10-14T10:00:00+00:00' },
  { user_id: 't2', read_at: '2026-10-14T09:59:00.000Z' },
  { user_id: 'admin', read_at: '2026-10-14T11:00:00.000Z' },
]
const seen = staffGroupSeenCount(msg, members, reads)
ok(seen.seen === 1 && seen.total === 3, `прочитал один из трёх: автор не в счёт, админ не участник, «+00:00» = «Z» (${seen.seen}/${seen.total})`)
ok(staffGroupSeenCount(msg, members, []).seen === 0, 'никто не открывал — 0')

const names = new Map([['t1', 'Борис Иванов']])
const list = staffGroupReaders(msg, members, reads, names)
ok(JSON.stringify(list.read) === JSON.stringify([{ id: 't1', name: 'Борис Иванов' }]), 'прочитали: имя как в ленте (связанный — под ФИО)')
ok(JSON.stringify(list.unread.map((p) => p.name)) === '["Анна","Пётр"]', 'не прочитали: по алфавиту, без автора и без админа')

ok(staffGroupSeenRu({ seen: 0, total: 3 }) === 'Пока никто не прочитал', '0 из 3 — «Пока никто не прочитал»')
ok(staffGroupSeenRu({ seen: 1, total: 3 }) === 'Прочитал 1 из 3', '1 из 3')
ok(staffGroupSeenRu({ seen: 2, total: 5 }) === 'Прочитали 2 из 5', '2 из 5')
ok(staffGroupSeenRu({ seen: 5, total: 5 }) === 'Прочитали все 5', 'все — «Прочитали все 5»')
ok(staffGroupSeenRu({ seen: 1, total: 1 }) === 'Прочитано', 'один участник прочитал — «Прочитано»')
ok(staffGroupSeenRu({ seen: 0, total: 0 }) === 'В чате пока никого нет', 'кроме автора никого — так и пишем')

ok(staffGroupPeerReadAt(reads, 'sup') === '2026-10-14T11:00:00.000Z', 'без списка участников — как раньше (любой)')
ok(staffGroupPeerReadAt(reads, 'sup', members.map((u) => u.id)) === '2026-10-14T10:00:00+00:00', '✓✓: просмотр главного админа «для контроля» не считается')

if (failed) {
  console.error(`\nverify-staff-group-pin: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-staff-group-pin: ok')
