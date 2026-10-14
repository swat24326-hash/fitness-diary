/**
 * Чат клуба: чей чат открыть, кто участник, «непрочитано» и «прочитано» у каждого своё, ✓✓, «без звука», push, адрес.
 * node scripts/verify-staff-group.mjs
 */
import { coachPushUrl } from '../src/lib/push/pushTargetUrlCore.js'
import {
  STAFF_GROUP_NO_ACCESS_RU,
  STAFF_GROUP_NO_CLUB_RU,
  STAFF_GROUP_PICK_CLUB_RU,
  buildStaffGroupMessageView,
  buildStaffGroupPushPayload,
  isStaffGroupUnread,
  pickStaffGroupMembers,
  sortStaffGroups,
  staffGroupAttention,
  staffGroupClubFor,
  staffGroupMembersRu,
  staffGroupPeerReadAt,
  staffGroupPreviewRu,
  staffGroupPushRecipients,
  staffGroupReadAt,
  staffGroupSummary,
  staffGroupsRailItem,
} from '../src/lib/chat/staffGroupCore.js'
import { staffFolderOfOpen, staffMessengerHref, staffOpenFromParams } from '../src/lib/chat/staffMessengerCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const CLUB = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const trainer = { id: 'u-t1', role: 'тренер', club_id: CLUB }
const sales = { id: 'u-s', role: 'sales_manager', club_id: CLUB }
const sup = { id: 'u-sup', role: 'supervisor', club_id: CLUB }
const admin = { id: 'u-a', role: 'admin', club_id: null }

/* Чей чат */
ok(staffGroupClubFor(trainer, '').ok && staffGroupClubFor(trainer, '').clubId === CLUB, 'тренер без club_id — чат своего клуба')
ok(staffGroupClubFor(sales, CLUB).ok, 'менеджер — свой клуб явно')
const alien = staffGroupClubFor(trainer, OTHER)
ok(!alien.ok && alien.status === 403 && alien.error === STAFF_GROUP_NO_ACCESS_RU, 'чужой клуб — 403')
const noClub = staffGroupClubFor({ id: 'x', role: 'supervisor', club_id: null }, '')
ok(!noClub.ok && noClub.status === 403 && noClub.error === STAFF_GROUP_NO_CLUB_RU, 'управляющий без клуба — 403 с понятной причиной')
ok(staffGroupClubFor(admin, OTHER).ok && staffGroupClubFor(admin, OTHER).clubId === OTHER, 'главный админ — любой клуб')
const adminNoClub = staffGroupClubFor(admin, '')
ok(!adminNoClub.ok && adminNoClub.status === 400 && adminNoClub.error === STAFF_GROUP_PICK_CLUB_RU, 'главный админ без клуба — 400')
ok(!staffGroupClubFor({ id: 'e', role: '', club_id: CLUB }, '').ok, 'пустая роль — нет доступа')
ok(staffGroupClubFor({ id: 'c', role: 'curator', club_id: CLUB }, '').status === 403, 'куратор — пока нет доступа (нет «Сообщений»)')

/* Участники */
const users = [
  trainer,
  sales,
  sup,
  admin,
  { id: 'u-blocked', role: 'trainer', club_id: CLUB, is_active: false },
  { id: 'u-alien', role: 'trainer', club_id: OTHER },
  { id: 'u-linked-t', role: 'trainer', club_id: CLUB },
  { id: 'u-empty', role: '', club_id: CLUB },
]
const members = pickStaffGroupMembers(users, CLUB, new Set(['u-linked-t'])).map((u) => u.id)
ok(JSON.stringify(members) === JSON.stringify(['u-t1', 'u-s', 'u-sup']), `участники — активные тренеры, менеджеры, управляющий своего клуба (${members.join(', ')})`)

/* Непрочитано и «прочитано» */
const thread = { last_message_at: '2026-10-14T10:05:00.000Z', last_author: 'u-s', last_preview: 'Проверка в 10:00' }
ok(isStaffGroupUnread(thread, null, 'u-t1'), 'нет отметки — новое от коллеги непрочитано')
ok(!isStaffGroupUnread(thread, { read_at: '2026-10-14T10:05:00.000Z' }, 'u-t1'), 'прочитал до последнего — новых нет')
ok(isStaffGroupUnread(thread, { read_at: '2026-10-14T10:00:00+00:00' }, 'u-t1'), 'время в разном виде (Z / +00:00) сравнивается как время')
ok(!isStaffGroupUnread(thread, null, 'u-s'), 'своё последнее — не «новое»')
ok(!isStaffGroupUnread({ last_message_at: null }, null, 'u-t1'), 'пустой чат — не новое')
ok(staffGroupReadAt(null, '2026-10-14T10:05:00.000Z') === '2026-10-14T10:05:00.000Z', 'первое открытие — отметка = время последнего показанного')
ok(staffGroupReadAt({ read_at: '2026-10-14T10:06:00.000Z' }, '2026-10-14T10:05:00.000Z') === null, 'отметка назад не двигается')
ok(staffGroupReadAt({ read_at: null }, '') === null, 'нечего показать — не пишем')

/* ✓✓ */
const reads = [
  { user_id: 'u-t1', read_at: '2026-10-14T10:09:00.000Z' },
  { user_id: 'u-s', read_at: '2026-10-14T10:03:00.000Z' },
  { user_id: 'u-sup', read_at: '2026-10-14T10:07:00.000Z' },
  { user_id: 'u-new', read_at: null },
]
ok(staffGroupPeerReadAt(reads, 'u-t1') === '2026-10-14T10:07:00.000Z', '✓✓ — позднее «прочитано» среди других, своё не в счёт')
ok(staffGroupPeerReadAt([{ user_id: 'u-t1', read_at: '2026-10-14T10:09:00.000Z' }], 'u-t1') === null, 'никто другой не открывал — одна галочка')

/* Строка списка */
const s = staffGroupSummary({ clubId: CLUB, name: 'FIT-CITY Центр', members: 3, thread, read: null, unreadCount: 4, viewerId: 'u-t1', lastAuthorName: 'Менеджер Анна Иванова' })
ok(s.unread && s.unread_count === 4 && s.last_author === 'client' && s.members === 3, 'строка: новое, число, чужое последнее')
ok(staffGroupPreviewRu(s) === 'Менеджер Анна Иванова: Проверка в 10:00', 'превью — имя автора целиком (порядок «Имя Фамилия» в базе разный)')
ok(staffGroupPreviewRu({ ...s, last_author: 'staff' }) === 'Вы: Проверка в 10:00', 'своё — «Вы: …»')
ok(staffGroupPreviewRu({ last_preview: '' }) === 'Общий чат сотрудников клуба', 'пустой чат — подпись')
const zero = staffGroupSummary({ clubId: CLUB, name: '', members: 0, thread, read: null, unreadCount: 0, viewerId: 'u-t1' })
ok(zero.unread_count === 1 && zero.name === 'Чат клуба', 'новое есть, счёт не дошёл — кружок «1»; без названия клуба — «Чат клуба»')
ok(staffGroupAttention(s) === 1, 'новое — +1 на конверте')
ok(staffGroupAttention({ ...s, muted: true }) === 0, 'заглушён — в конверт не входит')
ok(staffGroupAttention({ ...s, unread: false }) === 0, 'нет нового — 0')
ok(staffGroupMembersRu(1) === '1 участник' && staffGroupMembersRu(3) === '3 участника' && staffGroupMembersRu(11) === '11 участников', 'участник / участника / участников')

/* Push */
const to = staffGroupPushRecipients(['u-t1', 'u-s', 'u-sup', 'u-s'], ['u-sup'], 'u-t1')
ok(JSON.stringify(to) === JSON.stringify(['u-s']), `push: без автора, без заглушивших, без дублей (${to.join(', ')})`)
const payload = buildStaffGroupPushPayload({ clubId: CLUB, clubName: 'FIT-CITY Центр', authorName: 'Анна', body: 'Кто возьмёт клиента в 18:00?', silent: true })
ok(payload.title === 'FIT-CITY Центр' && payload.body === 'Анна: Кто возьмёт клиента в 18:00?', 'push: клуб в заголовке, «Имя: текст»')
ok(payload.url === `/messages?group=${CLUB}` && payload.tag === `group-${CLUB}` && payload.silent === true, 'push: адрес чата, тег, без звука')
ok(coachPushUrl(payload.url) === '/coach/group', 'телефон тренера: push ведёт в /coach/group')
ok(coachPushUrl(`/messages/dm/${CLUB}`) === `/coach/dm/${CLUB}`, 'личные push на телефоне — как раньше')

/* Адрес мессенджера */
const open = staffOpenFromParams(new URLSearchParams(`group=${CLUB}`))
ok(open?.type === 'group' && open.clubId === CLUB, 'адрес ?group= — открыт чат клуба')
ok(staffFolderOfOpen(open) === 'colleagues', 'push без папки — «Коллеги»')
ok(staffMessengerHref(new URLSearchParams('folder=colleagues&dm=u1'), { group: CLUB }) === `/messages?folder=colleagues&group=${CLUB}`, 'открыли чат — личный диалог закрыт')
ok(staffMessengerHref(new URLSearchParams(`group=${CLUB}`), { dm: 'u1' }) === '/messages?dm=u1', 'открыли личный — чат клуба закрыт')

/* Лента */
const names = new Map([['u-s', 'Анна']])
const mine = buildStaffGroupMessageView({ id: 'm1', body: 'Привет', author_user_id: 'u-t1', created_at: thread.last_message_at }, 'u-t1', names)
const theirs = buildStaffGroupMessageView({ id: 'm2', body: 'Привет', author_user_id: 'u-s', created_at: thread.last_message_at }, 'u-t1', names)
const gone = buildStaffGroupMessageView({ id: 'm3', body: 'Привет', author_user_id: null, created_at: thread.last_message_at }, 'u-t1', names)
ok(mine.mine && mine.side === 'staff' && mine.author_name === '', 'своё — справа, без имени')
ok(!theirs.mine && theirs.side === 'client' && theirs.author_name === 'Анна', 'чужое — слева, с именем автора')
ok(gone.author_name === 'Сотрудник', 'автор удалён — «Сотрудник»')

/* Админ: список и папка */
const sorted = sortStaffGroups([
  { club_id: 'a', name: 'Б-клуб', last_message_at: null, unread: false },
  { club_id: 'b', name: 'А-клуб', last_message_at: null, unread: false },
  { club_id: 'c', name: 'Я-клуб', last_message_at: '2026-10-14T09:00:00.000Z', unread: false },
  { club_id: 'd', name: 'Ю-клуб', last_message_at: '2026-10-13T09:00:00.000Z', unread: true },
]).map((g) => g.club_id)
ok(JSON.stringify(sorted) === JSON.stringify(['d', 'c', 'b', 'a']), `админ: новое → свежее → по названию (${sorted.join(',')})`)
const rail = staffGroupsRailItem([{ unread: true }, { unread: true, muted: true }, { unread: false }])
ok(rail.key === 'groups' && rail.unread === 1 && rail.total === 3, 'папка «Чаты клубов»: число — незаглушённые с новым')

if (failed) {
  console.error(`\nverify-staff-group: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-staff-group: OK')
