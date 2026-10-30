/**
 * Диалоги клиента с инструкторами АЗ: список, доступ, вкладка «От тренера», ключи.
 * node scripts/verify-client-az-chat.mjs
 */
import {
  CHAT_KIND_AZ_INSTRUCTOR,
  canStaffReadChat,
  canStaffWriteChat,
  chatKindsForStaff,
  chatPushAudience,
  clientChatAttention,
  clientChatKinds,
  isChatKind,
} from '../src/lib/chat/chatAccessCore.js'
import {
  buildClientChatDialogs,
  chatDialogKey,
  clientAzInstructorPeerIds,
  clientChatPath,
  clientMayChatAzInstructor,
  clientShowsFromTrainerTab,
  isAzInstructorChatKind,
  parseStaffClientChatKey,
  staffClientChatKey,
} from '../src/lib/chat/clientAzChatCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const clientPz = { id: 'c1', trainer_id: 't1', club_id: 'club' }
const clientAz = { id: 'c2', trainer_id: null, club_id: 'club' }
const azRows = [
  { instructor_id: 'i1', direction_type_id: 'd-box' },
  { instructor_id: 'i1', direction_type_id: 'd-step' },
  { instructor_id: 'i2', direction_type_id: 'd-box' },
]
const names = { i1: 'Олег', i2: 'Наташа' }
const dirs = { 'd-box': 'Бокс', 'd-step': 'Степ' }

ok(isChatKind(CHAT_KIND_AZ_INSTRUCTOR) && isAzInstructorChatKind('az_instructor'), 'kind az_instructor')
ok(chatKindsForStaff({ isTrainer: true, user: { id: 't1' } }).includes(CHAT_KIND_AZ_INSTRUCTOR), 'тренер видит az kind')
ok(chatKindsForStaff({ isAdmin: true }).includes(CHAT_KIND_AZ_INSTRUCTOR), 'админ видит az kind')

ok(clientChatKinds(clientAz).join() === 'sales,supervisor', 'чистый АЗ — без диалога «Тренер»')
ok(!clientShowsFromTrainerTab(clientAz), 'чистый АЗ — без вкладки «От тренера»')
ok(clientShowsFromTrainerTab(clientPz), 'ПЗ — вкладка «От тренера»')
ok(clientShowsFromTrainerTab(null), 'кэш пуст — вкладку не прячем')
ok(
  !clientShowsFromTrainerTab(clientPz, { liveHalls: new Set(['az']) }),
  'был ПЗ → только АЗ — вкладку скрываем по живым залам',
)
ok(clientShowsFromTrainerTab(clientAz, { liveHalls: new Set(['pz', 'az']) }), 'смесь с открытым ПЗ — вкладка есть')
ok(clientShowsFromTrainerTab(clientPz, { liveHalls: new Set() }), 'пустой Set залов — не прячем, смотрим тренера')
ok(!clientShowsFromTrainerTab(clientAz, { liveHalls: new Set() }), 'пустой Set + нет тренера — нет вкладки')
ok(clientShowsFromTrainerTab({ has_trainer: true }), 'has_trainer без uuid')
ok(!clientShowsFromTrainerTab({ has_trainer: false }), 'has_trainer false — нет вкладки')

const dialogs = buildClientChatDialogs({
  client: clientAz,
  azInstructors: azRows,
  instructorNameById: names,
  directionNameById: dirs,
})
ok(dialogs.filter((d) => d.kind === 'az_instructor').length === 2, 'один диалог на инструктора, не на строку')
ok(dialogs.some((d) => d.title === 'Бокс · Олег' || d.title.startsWith('Бокс')), 'заголовок с направлением')
ok(dialogs.every((d) => d.kind !== 'trainer'), 'у чистого АЗ нет trainer в списке')

ok(clientMayChatAzInstructor(azRows, 'i1') && !clientMayChatAzInstructor(azRows, 'x'), 'доступ только назначенному')
ok(clientAzInstructorPeerIds(azRows).join() === 'i1,i2', 'уникальные peer id')

ok(clientChatPath({ kind: 'sales' }) === '/me/chat/sales', 'путь classic')
ok(clientChatPath({ kind: 'az_instructor', peer_user_id: 'i1' }) === '/me/chat/az_instructor/i1', 'путь az')
ok(chatDialogKey({ kind: 'az_instructor', peer_user_id: 'i1' }) === 'az_instructor:i1', 'ключ диалога')

ok(staffClientChatKey({ clientId: 'c', kind: 'az_instructor', peerUserId: 'i1' }) === 'c:az_instructor:i1', 'staff key')
ok(parseStaffClientChatKey('c:az_instructor:i1')?.peerUserId === 'i1', 'parse staff key')
ok(parseStaffClientChatKey('c:trainer')?.peerUserId === null, 'parse classic')

const instructor = { isTrainer: true, user: { id: 'i1' }, profile: { club_id: 'club' } }
const other = { isTrainer: true, user: { id: 'i9' }, profile: { club_id: 'club' } }
ok(canStaffReadChat(instructor, 'az_instructor', clientAz, { peerUserId: 'i1' }), 'свой инструктор читает')
ok(canStaffWriteChat(instructor, 'az_instructor', clientAz, { peerUserId: 'i1' }), 'свой инструктор пишет')
ok(!canStaffReadChat(other, 'az_instructor', clientAz, { peerUserId: 'i1' }), 'чужой инструктор не видит')
ok(chatPushAudience('az_instructor', 'client', clientAz, { peerUserId: 'i1' })?.userIds?.join() === 'i1', 'пуш инструктору')

const threads = [
  { kind: 'sales', last_message_at: '2026-10-10T10:00:00Z', last_author: 'staff', client_read_at: null },
  { kind: 'az_instructor', peer_user_id: 'i1', last_message_at: '2026-10-10T10:00:00Z', last_author: 'staff', client_read_at: null },
  { kind: 'az_instructor', peer_user_id: 'x', last_message_at: '2026-10-10T10:00:00Z', last_author: 'staff', client_read_at: null },
]
ok(clientChatAttention(clientAz, threads, ['i1', 'i2']) === 2, 'attention: sales + свой az, чужой peer не считаем')

if (failed) {
  console.error(`\nverify-client-az-chat: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-client-az-chat: OK')
