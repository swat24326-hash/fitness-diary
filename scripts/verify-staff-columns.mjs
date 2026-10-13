/**
 * Главный админ: сотрудники сети столбцами по клубам, поиск по клубу и по человеку.
 * node scripts/verify-staff-columns.mjs
 */
import {
  NETWORK_COLUMN_RU,
  STAFF_RECENT_KEY,
  STAFF_VIEW_ALL,
  STAFF_VIEW_UNREAD,
  buildStaffColumns,
  pickStaffSections,
  staffClubRail,
  staffColumnsFoundRu,
} from '../src/lib/chat/staffColumnsCore.js'
import { buildStaffContacts } from '../src/lib/chat/staffDmContactsCore.js'

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
  console.log('ok:', msg)
}

const person = (id, name, role, club_id, club_name, extra = {}) => ({
  id,
  name,
  role,
  club_id,
  club_name,
  has_app: true,
  has_thread: false,
  unread: false,
  ...extra,
})

const people = [
  person('t1', 'Борис Тренер', 'trainer', 'msk', 'X•fit Москва'),
  person('s1', 'Александр Кукарек', 'supervisor', 'msk', 'X•fit Москва', { linked_trainer: true }),
  person('t2', 'Анна Ёлкина', 'trainer', 'spb', 'X•fit Питер', { has_app: false }),
  person('m2', 'Вера Продажи', 'sales', 'spb', 'X•fit Питер', { unread: true }),
  person('a0', 'Главный', 'admin', null, undefined),
]

const cols = buildStaffColumns(people)
ok(cols.map((c) => c.title).join('|') === `${NETWORK_COLUMN_RU}|X•fit Питер|X•fit Москва`, 'Сеть первой, затем клубы с непрочитанным, затем по алфавиту')
ok(cols[1].unread === 1, 'в шапке клуба — сколько ждут ответа')
ok(cols[2].people.map((p) => p.id).join() === 's1,t1', 'в клубе: управляющий выше тренера')
ok(cols[1].people.map((p) => p.id).join() === 'm2,t2', 'непрочитанные выше, без приложения ниже')
ok(cols[2].people[0].role_label === 'Управляющий · тренер', 'совмещённая роль подписана')
ok(cols[1].people[1].role_label === 'Тренер', 'обычная роль подписана')
ok(cols[1].people[0].role_label === 'Менеджер по продажам', 'менеджер — не «Сотрудник» (роль в контакте уже приведена: sales)')

ok(cols[1].reachable.map((p) => p.id).join() === 'm2' && cols[1].idle.map((p) => p.id).join() === 't2', 'без приложения — в свёрнутую группу внизу')
const talked = buildStaffColumns([person('x', 'Без телефона', 'trainer', 'msk', 'М', { has_app: false, has_thread: true })])
ok(talked[0].reachable.length === 1, 'без приложения, но переписка уже есть — не прячем')
ok(staffColumnsFoundRu(buildStaffColumns(people, 'x•fit')) === 'Нашли 4 · 2 клуба', 'счётчик поиска: люди и клубы')
ok(staffColumnsFoundRu([]) === 'Никого не нашли', 'счётчик поиска: пусто')

const rail = staffClubRail(cols)
ok(rail.map((r) => r.title).join('|') === `Все клубы|Ждут ответа|${NETWORK_COLUMN_RU}|X•fit Питер|X•fit Москва`, 'слева: «Все», «Ждут ответа», затем клубы')
ok(rail[0].total === 5 && rail[0].unread === 1 && rail[1].total === 1, 'у «Всех» — сколько людей и сколько ждут ответа')
ok(rail[3].key === 'club:spb' && rail[3].unread === 1, 'у клуба — ключ и число новых')
ok(pickStaffSections(cols, STAFF_VIEW_ALL).length === 3, '«Все клубы» — все разделы')
const waiting = pickStaffSections(cols, STAFF_VIEW_UNREAD)
ok(waiting.length === 1 && waiting[0].people.map((p) => p.id).join() === 'm2' && waiting[0].idle.length === 0, '«Ждут ответа» — только непрочитанные, по клубам')
ok(pickStaffSections(cols, 'club:msk').map((c) => c.key).join() === 'msk', 'выбран клуб — только он')

const chats = buildStaffColumns([
  person('old', 'Старый Диалог', 'trainer', 'msk', 'X•fit Москва', { has_thread: true, last_message_at: '2026-10-10T10:00:00Z' }),
  person('new', 'Свежий Диалог', 'trainer', 'spb', 'X•fit Питер', { has_thread: true, last_message_at: '2026-10-13T10:00:00Z' }),
  person('ask', 'Ждёт Ответа', 'trainer', 'msk', 'X•fit Москва', { has_thread: true, unread: true, last_message_at: '2026-10-09T10:00:00Z' }),
  person('quiet', 'Без Переписки', 'trainer', 'msk', 'X•fit Москва'),
])
const all = pickStaffSections(chats, STAFF_VIEW_ALL)
ok(all[0].key === STAFF_RECENT_KEY && all[0].title === 'Переписки', '«Все клубы»: сверху «Переписки» одной лентой')
ok(all[0].people.map((p) => p.id).join() === 'ask,new,old', 'в «Переписках»: непрочитанные, затем свежие — из разных клубов подряд')
ok(all[0].people[1].club_title === 'X•fit Питер' && all[0].unread === 1, 'у переписки — клуб; в шапке — сколько ждут ответа')
ok(all.length === 2 && all[1].people.map((p) => p.id).join() === 'quiet', 'ниже клубы — без тех, кто уже в «Переписках» (без дублей)')
ok(pickStaffSections(chats, 'club:msk')[0].people.length === 3, 'выбран клуб — все его люди, и с перепиской тоже')
ok(pickStaffSections(chats, STAFF_VIEW_UNREAD).map((c) => c.people.map((p) => p.id).join()).join() === 'ask', '«Ждут ответа» — одна лента')
ok(pickStaffSections(chats, STAFF_VIEW_ALL, true).every((c) => c.key !== STAFF_RECENT_KEY), 'при поиске — по клубам, без «Переписок»')
ok(pickStaffSections(cols, 'club:нет-такого').length === 3, 'клуба больше нет — показываем все')
ok(pickStaffSections(buildStaffColumns(people, 'кукарек'), 'club:spb', true)[0].key === 'msk', 'поиск — по всем клубам, даже если выбран другой')

const byClub = buildStaffColumns(people, 'питер')
ok(byClub.length === 1 && byClub[0].people.length === 2, 'поиск по клубу — весь клуб')
const byName = buildStaffColumns(people, 'кукарек')
ok(byName.length === 1 && byName[0].people.map((p) => p.id).join() === 's1', 'поиск по человеку — только он, в своём клубе')
ok(buildStaffColumns(people, 'елкина')[0]?.people[0]?.id === 't2', 'ё = е')
ok(buildStaffColumns(people, 'нет такого').length === 0, 'ничего не нашли — пусто')
ok(buildStaffColumns([]).length === 0, 'пустой список')

const [c] = buildStaffContacts({
  viewerId: 'a0',
  peers: [{ id: 's1', name: 'Александр Кукарек', role: 'supervisor', club_id: 'msk', club_name: 'X•fit Москва', linked_trainer: true }],
  liveUserIds: [],
  threads: [],
}).admin
ok(c.club_id === 'msk' && c.linked_trainer === true, 'контакт несёт club_id и признак совмещённой роли')
const [plain] = buildStaffContacts({ viewerId: 'x', peers: [{ id: 't1', role: 'trainer', club_id: 'msk' }], liveUserIds: [], threads: [] }).colleagues
ok(!('club_id' in plain) && !('linked_trainer' in plain), 'у сотрудника клуба лишних полей нет')

console.log('verify-staff-columns: all passed')
