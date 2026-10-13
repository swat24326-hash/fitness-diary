/**
 * Главный админ: сотрудники сети столбцами по клубам, поиск по клубу и по человеку.
 * node scripts/verify-staff-columns.mjs
 */
import { NETWORK_COLUMN_RU, buildStaffColumns } from '../src/lib/chat/staffColumnsCore.js'
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
