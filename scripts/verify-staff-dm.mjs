/**
 * Переписка сотрудник ↔ сотрудник: права пары, чтение своей истории, папки, вид диалога со своей стороны.
 * node scripts/verify-staff-dm.mjs
 */
import { isChatUnreadFor } from '../src/lib/chat/chatAccessCore.js'
import {
  STAFF_DM_BLOCKED_RU,
  buildStaffDmMessageView,
  buildStaffDmPushPayload,
  canReadStaffDm,
  pickStaffDmPeers,
  staffDmFolderOf,
  staffDmPair,
  staffDmPairAccess,
  staffDmRoleOf,
  staffDmThreadForViewer,
  staffDmWriteAccess,
} from '../src/lib/chat/staffDmAccessCore.js'
import { buildStaffContacts } from '../src/lib/chat/staffDmContactsCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const CLUB = 'club-1'
const trainer = { id: 'u-t1', role: 'trainer', club_id: CLUB, name: 'Тренер Один' }
const trainer2 = { id: 'u-t2', role: 'тренер', club_id: CLUB, name: 'Тренер Два' }
const sup = { id: 'u-sup', role: 'supervisor', club_id: CLUB, name: 'Управляющий' }
const sales = { id: 'u-sales', role: 'sales_manager', club_id: CLUB, name: 'Менеджер' }
const admin = { id: 'u-admin', role: 'admin', club_id: null, name: 'Админ' }
const alien = { id: 'u-alien', role: 'trainer', club_id: 'club-2', name: 'Чужой' }
const blocked = { ...trainer2, id: 'u-blocked', is_active: false }

ok(staffDmRoleOf('Тренер') === 'trainer' && staffDmRoleOf('менеджер по продажам') === 'sales', 'роль: кириллица как в users')
ok(staffDmRoleOf('') === null && staffDmRoleOf('curator') === null, 'роль: пустая и куратор — не в переписке')
ok(staffDmRoleOf('admin') === 'admin' && staffDmRoleOf('Администратор') === 'admin', 'роль: главный админ — в переписке')
ok(staffDmFolderOf('admin') === 'admin', 'папка: главный админ — «Администрация»')
ok(staffDmFolderOf('trainer') === 'colleagues', 'папка: тренер — «Коллеги»')
ok(staffDmFolderOf('supervisor') === 'admin' && staffDmFolderOf('sales_manager') === 'admin', 'папка: управляющий и менеджер — «Администрация»')

ok(staffDmPairAccess(trainer, sup).ok, 'тренер → управляющий своего клуба')
ok(staffDmPairAccess(trainer, trainer2).ok, 'тренер → коллега своего клуба')
ok(staffDmPairAccess(sales, trainer).ok, 'менеджер → тренер своего клуба')
ok(staffDmPairAccess(trainer, alien).status === 403, 'чужой клуб — 403')
ok(staffDmPairAccess(trainer, trainer).status === 400, 'самому себе — 400')
ok(staffDmPairAccess(trainer, null).status === 404, 'нет собеседника — 404')
ok(staffDmPairAccess({ ...trainer, role: '' }, sup).status === 403, 'пустая роль — 403')
ok(staffDmPairAccess(admin, trainer).ok && staffDmPairAccess(admin, alien).ok, 'главный админ → любой сотрудник любого клуба (у админа клуба нет)')
ok(staffDmPairAccess(trainer, admin).ok, 'сотрудник → главный админ (ответить)')
ok(staffDmPairAccess(admin, { ...admin, id: 'u-admin2' }).ok, 'админ → другой админ')
ok(staffDmPairAccess(admin, admin).status === 400, 'админ сам себе — 400')
ok(staffDmPairAccess(admin, { id: 'u-cur', role: 'curator', club_id: CLUB }).status === 403, 'куратору не пишем — у него нет «Сообщений»')
ok(staffDmWriteAccess(admin, blocked).status === 409, 'админ: заблокированному не пишем')
ok(staffDmPairAccess(alien, sup).status === 403, 'обход через админа не открывает чужой клуб остальным')
ok(staffDmPairAccess({ ...sup, club_id: '' }, trainer).status === 403, 'без клуба — 403')

ok(staffDmWriteAccess(trainer, blocked).status === 409 && staffDmWriteAccess(trainer, blocked).error === STAFF_DM_BLOCKED_RU, 'заблокированному не пишем — 409')
ok(canReadStaffDm(trainer, { ...alien }, true), 'своя история читается и после смены клуба')
ok(!canReadStaffDm(trainer, alien, false), 'без диалога чужой клуб не открыть')
ok(!canReadStaffDm(trainer, trainer, true), 'диалог с самим собой не читается')

const pair = staffDmPair('u-t1', 'u-sup')
ok(pair.user_lo === 'u-sup' && pair.user_hi === 'u-t1', 'пара упорядочена: один диалог на двоих')
ok(JSON.stringify(staffDmPair('u-sup', 'u-t1')) === JSON.stringify(pair), 'порядок аргументов не важен')

const thread = {
  ...pair,
  last_message_at: '2026-10-13T10:00:00Z',
  last_author: 'u-sup',
  last_preview: 'Зайдите после смены',
  lo_read_at: '2026-10-13T10:00:00Z',
  hi_read_at: null,
  lo_unread: 0,
  hi_unread: 2,
}
const forTrainer = staffDmThreadForViewer(thread, 'u-t1')
ok(isChatUnreadFor('staff', forTrainer) && forTrainer.staff_unread === 2, 'тренеру: от управляющего 2 новых')
ok(forTrainer.client_read_at === '2026-10-13T10:00:00Z', 'тренеру: когда управляющий прочитал (галочки)')
const forSup = staffDmThreadForViewer(thread, 'u-sup')
ok(!isChatUnreadFor('staff', forSup) && forSup.last_author === 'staff', 'управляющему: своё сообщение — не новое')
ok(staffDmThreadForViewer(thread, 'u-other') === null, 'посторонний не видит диалог')

const mine = buildStaffDmMessageView({ id: 'm1', body: 'Ок', created_at: 'x', author_user_id: 'u-t1' }, 'u-t1')
const theirs = buildStaffDmMessageView({ id: 'm2', body: 'Жду', created_at: 'x', author_user_id: 'u-sup' }, 'u-t1')
ok(mine.mine && mine.side === 'staff' && !theirs.mine && theirs.side === 'client', 'сообщение: «моё» по автору')

const peers = pickStaffDmPeers(trainer, [trainer, trainer2, sup, sales, admin, alien, blocked, { id: 'u-empty', role: '', club_id: CLUB }])
ok(
  JSON.stringify(peers.map((p) => p.id)) === JSON.stringify(['u-t2', 'u-sup', 'u-sales']),
  `кандидаты: свой клуб, активные, с ролью, без себя и админа (${peers.map((p) => p.id).join(',')})`,
)
const withAdmin = pickStaffDmPeers(trainer, [trainer2, admin], ['u-admin'])
ok(withAdmin.some((p) => p.id === 'u-admin'), 'админ уже написал тренеру — у тренера он в списке, можно ответить')
const network = pickStaffDmPeers(admin, [admin, trainer, trainer2, sup, sales, alien, blocked, { id: 'u-empty', role: '', club_id: CLUB }])
ok(
  JSON.stringify(network.map((p) => p.id)) === JSON.stringify(['u-t1', 'u-t2', 'u-sup', 'u-sales', 'u-alien']),
  `у админа: вся сеть, активные, с ролью, без себя (${network.map((p) => p.id).join(',')})`,
)
const adminContacts = buildStaffContacts({ viewerId: 'u-admin', peers: [{ ...alien, club_name: 'Клуб 2' }, sup], liveUserIds: [], threads: [] })
ok(adminContacts.colleagues[0]?.club_name === 'Клуб 2' && !('club_name' in adminContacts.admin[0]), 'у админа в строке — название клуба')

const contacts = buildStaffContacts({ viewerId: 'u-t1', peers, liveUserIds: ['u-t2'], threads: [thread] })
ok(contacts.colleagues.length === 1 && contacts.colleagues[0].has_app, 'Коллеги: тренер с телефоном — ярко')
const supRow = contacts.admin.find((c) => c.id === 'u-sup')
ok(supRow?.has_app && supRow.unread && supRow.has_thread, 'Администрация: управляющий ждёт ответа — ярко, с диалогом')
ok(contacts.admin.find((c) => c.id === 'u-sales')?.has_app === false, 'Администрация: менеджер без приложения — тускло')

const push = buildStaffDmPushPayload({ authorId: 'u-t1', authorName: 'Тренер Один', body: 'Сломан тренажёр\nв зале 2' })
ok(push.url === '/messages/dm/u-t1' && push.title === 'Тренер Один', 'push: ведёт в диалог с автором, заголовок — имя')
ok(push.body === 'Сломан тренажёр в зале 2', 'push: превью в одну строку')

if (failed) {
  console.error(`\nverify-staff-dm: ${failed} failed`)
  process.exit(1)
}
console.log('\nverify-staff-dm: all passed')
