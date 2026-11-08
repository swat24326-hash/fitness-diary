/**
 * Группа АЗ: доступ, состав, непрочитано, ✓✓, mute, push, адреса.
 * node scripts/verify-az-group.mjs
 */
import { coachPushUrl } from '../src/lib/push/pushTargetUrlCore.js'
import {
  AZ_GROUP_EMPTY_RU,
  AZ_GROUP_NO_ACCESS_RU,
  AZ_GROUP_TITLE_RU,
  azGroupAccess,
  azGroupAttention,
  azGroupClientHref,
  azGroupCoachHref,
  azGroupInstructorHref,
  azGroupMembersRu,
  azGroupParticipantKey,
  azGroupPeerReadAt,
  azGroupPreviewRu,
  azGroupPushRecipients,
  azGroupReadAt,
  azGroupSummary,
  buildAzGroupMessageView,
  buildAzGroupPushPayload,
  isAzGroupUnread,
  pickAzGroupMembers,
} from '../src/lib/chat/azGroupCore.js'

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

ok(azGroupParticipantKey({ side: 'user', userId: INST }) === `u:${INST}`, 'ключ инструктора u:')
ok(azGroupParticipantKey({ side: 'client', clientId: CLIENT_A }) === `c:${CLIENT_A}`, 'ключ клиента c:')

const asInstructor = { kind: 'instructor', userId: INST }
const asClient = { kind: 'client', clientId: CLIENT_A }
const threadMeta = { instructorUserId: INST, clientIds: [CLIENT_A, CLIENT_B] }

ok(azGroupAccess(asInstructor, threadMeta).ok, 'инструктор своего чата — ок')
ok(!azGroupAccess({ kind: 'instructor', userId: 'other' }, threadMeta).ok, 'чужой инструктор — 403')
ok(azGroupAccess(asClient, threadMeta).ok, 'подопечный — ок')
const alienClient = azGroupAccess({ kind: 'client', clientId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }, threadMeta)
ok(!alienClient.ok && alienClient.status === 403 && alienClient.error === AZ_GROUP_NO_ACCESS_RU, 'чужой клиент — 403')

const members = pickAzGroupMembers({
  instructorId: INST,
  instructorName: 'Олег',
  links: [
    { instructor_id: INST, client_id: CLIENT_A },
    { instructor_id: INST, client_id: CLIENT_A },
    { instructor_id: INST, client_id: CLIENT_B },
    { instructor_id: 'other', client_id: CLIENT_A },
  ],
  clients: [
    { id: CLIENT_A, full_name: 'Анна' },
    { id: CLIENT_B, name: 'Борис' },
  ],
})
ok(members.length === 3 && members[0].side === 'user' && members[0].name === 'Олег', 'состав: инструктор первым')
ok(members[1].id === CLIENT_A && members[2].id === CLIENT_B, 'клиенты без дублей, чужой инструктор не в счёт')

const viewMine = buildAzGroupMessageView(
  { id: 'm1', body: 'Привет', author_side: 'user', author_user_id: INST, created_at: '2026-11-03T10:00:00Z' },
  asInstructor,
)
ok(viewMine.mine && viewMine.side === 'staff' && viewMine.author_name === '', 'своё сообщение инструктора')
const viewOther = buildAzGroupMessageView(
  {
    id: 'm2',
    body: 'Ок',
    author_side: 'client',
    author_client_id: CLIENT_A,
    author_name: 'Анна',
    created_at: '2026-11-03T10:01:00Z',
  },
  asInstructor,
)
ok(!viewOther.mine && viewOther.author_name === 'Анна', 'чужое от клиента — имя')

const thread = {
  last_message_at: '2026-11-03T10:05:00.000Z',
  last_author_side: 'client',
  last_author_client_id: CLIENT_A,
  last_preview: 'Завтра бокс в 19:00',
}
const viewerKey = azGroupParticipantKey({ side: 'user', userId: INST })
ok(isAzGroupUnread(thread, null, viewerKey), 'нет отметки — новое от клиента')
ok(!isAzGroupUnread(thread, { read_at: '2026-11-03T10:05:00.000Z' }, viewerKey), 'прочитал — не новое')
ok(
  isAzGroupUnread(thread, { read_at: '2026-11-03T10:00:00+00:00' }, viewerKey),
  'время Z / +00:00 сравнивается как время',
)
ok(
  !isAzGroupUnread(
    { ...thread, last_author_side: 'user', last_author_user_id: INST, last_author_client_id: null },
    null,
    viewerKey,
  ),
  'своё последнее — не новое',
)
ok(azGroupReadAt(null, '2026-11-03T10:05:00.000Z') === '2026-11-03T10:05:00.000Z', 'первая отметка')
ok(azGroupReadAt({ read_at: '2026-11-03T10:06:00.000Z' }, '2026-11-03T10:05:00.000Z') === null, 'назад не двигаем')

const reads = [
  { participant: `u:${INST}`, read_at: '2026-11-03T10:09:00.000Z' },
  { participant: `c:${CLIENT_A}`, read_at: '2026-11-03T10:07:00.000Z' },
  { participant: `c:${CLIENT_B}`, read_at: '2026-11-03T10:03:00.000Z' },
]
ok(azGroupPeerReadAt(reads, viewerKey) === '2026-11-03T10:07:00.000Z', '✓✓ — позднее среди других')
ok(azGroupPeerReadAt([{ participant: viewerKey, read_at: '2026-11-03T10:09:00.000Z' }], viewerKey) === null, 'никто другой — одна галочка')

const s = azGroupSummary({
  instructorUserId: INST,
  instructorName: 'Олег',
  members: 3,
  thread,
  read: null,
  unreadCount: 2,
  viewerKey,
  lastAuthorName: 'Анна',
})
ok(s.unread && s.unread_count === 2 && s.last_author === 'client', 'строка: новое от клиента')
ok(s.name === `${AZ_GROUP_TITLE_RU} · Олег`, 'название с именем инструктора')
ok(azGroupPreviewRu(s) === 'Анна: Завтра бокс в 19:00', 'превью с именем')
ok(azGroupPreviewRu({ ...s, last_author: 'staff' }) === 'Вы: Завтра бокс в 19:00', 'своё — Вы:')
ok(azGroupPreviewRu({ last_preview: '' }) === AZ_GROUP_EMPTY_RU, 'пустой чат')
ok(azGroupAttention(s) === 1, 'новое — в конверт')
ok(azGroupAttention({ ...s, muted: true }) === 0, 'mute — не в конверт')
ok(azGroupMembersRu(1) === '1 участник' && azGroupMembersRu(3) === '3 участника', 'склонение участников')

const to = azGroupPushRecipients(
  [`u:${INST}`, `c:${CLIENT_A}`, `c:${CLIENT_B}`, `c:${CLIENT_A}`],
  [`c:${CLIENT_B}`],
  `u:${INST}`,
)
ok(JSON.stringify(to) === JSON.stringify([`c:${CLIENT_A}`]), `push без автора и mute (${to.join(', ')})`)
const payloadStaff = buildAzGroupPushPayload({
  instructorUserId: INST,
  title: 'Группа АЗ · Олег',
  authorName: 'Анна',
  body: 'Буду',
  silent: true,
})
ok(payloadStaff.url === azGroupInstructorHref(INST) && payloadStaff.silent === true, 'push инструктору — ?azGroup=')
ok(coachPushUrl(payloadStaff.url) === azGroupCoachHref(), 'телефон инструктора: push → /coach/az-group')
const payloadClient = buildAzGroupPushPayload({
  instructorUserId: INST,
  authorName: 'Олег',
  body: 'Не забудьте коврик',
  forClient: true,
})
ok(payloadClient.url === azGroupClientHref(INST), 'push клиенту — /me/az-group/:id')

if (failed) {
  console.error(`\nverify-az-group: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-az-group: ok')
