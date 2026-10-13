/**
 * «Сообщения клуба» сотрудника: порядок папок, папка по умолчанию, что открыто справа, адреса.
 * node scripts/verify-staff-messenger.mjs
 */
import {
  STAFF_FOLDER_INBOX,
  pickStaffFolder,
  staffChatFolders,
  staffFolderOfOpen,
  staffMessengerFolders,
  staffMessengerHref,
  staffOpenFromParams,
} from '../src/lib/chat/staffMessengerCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}

const chats = [
  { id: 'clients', label: 'Клиенты', unread: 0 },
  { id: 'colleagues', label: 'Коллеги', unread: 0 },
  { id: 'admin', label: 'Администрация', unread: 0 },
]
const all = staffMessengerFolders(chats, 2)
ok(all.map((f) => f.id).join(',') === 'clients,colleagues,admin,inbox', 'сначала переписка, «Рассылки» — последней папкой')
ok(all.at(-1).unread === 2 && all.at(-1).label === 'Рассылки', 'у «Рассылок» число новых')
ok(staffMessengerFolders(null, -3).length === 1 && staffMessengerFolders([], 'x')[0].unread === 0, 'нет папок / мусор в числе — только «Рассылки», 0')

const quiet = staffMessengerFolders(chats, 0)
ok(pickStaffFolder({ folders: quiet }) === 'clients', 'конверт, ничего нового — сразу «Клиенты» (мессенджер, не рассылки)')
ok(pickStaffFolder({ folders: all }) === STAFF_FOLDER_INBOX, 'новое только в рассылках — открываем их, где горит значок')
const both = staffMessengerFolders([chats[0], { ...chats[1], unread: 1 }, chats[2]], 3)
ok(pickStaffFolder({ folders: both }) === 'colleagues', 'новое и в переписке, и в рассылках — сначала переписка')
ok(pickStaffFolder({ requested: 'admin', folders: both }) === 'admin', 'папка в адресе — её, даже если новое в другой')
ok(pickStaffFolder({ requested: 'complaints', folders: quiet }) === 'clients', 'папки из адреса нет у этой роли — по умолчанию')
ok(pickStaffFolder({ folders: [] }) === '', 'папок нет — пусто')

const p = (s) => new URLSearchParams(s)
ok(staffOpenFromParams(p('dm=u1'))?.userId === 'u1', 'dm — переписка с коллегой')
const chat = staffOpenFromParams(p('chat=c1:trainer'))
ok(chat?.type === 'chat' && chat.clientId === 'c1' && chat.kind === 'trainer', 'chat=клиент:вид — переписка с клиентом')
ok(staffOpenFromParams(p('chat=c1')) === null, 'chat без вида — ничего не открываем')
ok(staffOpenFromParams(p('item=i1'))?.type === 'item', 'item — рассылка')
ok(staffOpenFromParams(p('folder=clients')) === null, 'только папка — справа пусто')

ok(staffFolderOfOpen({ type: 'item', id: 'i' }) === STAFF_FOLDER_INBOX, 'ссылка на рассылку — папка «Рассылки»')
ok(staffFolderOfOpen({ type: 'chat', clientId: 'c', kind: 'supervisor' }) === 'complaints', 'жалоба — папка «Жалобы и предложения»')
ok(staffFolderOfOpen({ type: 'chat', clientId: 'c', kind: 'trainer' }) === 'clients', 'клиент — «Клиенты»')
ok(staffFolderOfOpen({ type: 'dm', userId: 'u' }) === '', 'коллега — папку не угадываем (коллеги или администрация)')

ok(staffMessengerHref(p('folder=clients&dm=u1'), { chat: 'c1:trainer' }) === '/messages?folder=clients&chat=c1%3Atrainer', 'открыли клиента — коллега справа закрылся')
ok(staffMessengerHref(p('folder=clients&chat=c1%3Atrainer'), { close: true }) === '/messages?folder=clients', '«К списку» — закрыть открытое, папка остаётся')
ok(staffMessengerHref(p('tab=chats'), { folder: 'inbox' }) === '/messages?folder=inbox', 'старое ?tab=chats выбрасываем')
ok(staffMessengerHref(p(''), { close: true }) === '/messages', 'пустой адрес — /messages')

const trainer = staffChatFolders({ folders: [{ id: 'clients', label: 'Клиенты', unread: 1, contacts: [] }, { id: 'colleagues', label: 'Коллеги', unread: 0 }] })
ok(trainer.length === 2 && trainer[0].threads === false, 'тренер: «Клиенты» с сервера папкой (все свои клиенты)')
const manager = staffChatFolders({ folders: [{ id: 'colleagues', label: 'Тренеры', unread: 0 }], threads: [{ unread: true }, { unread: false }, { unread: true }] })
ok(manager[0].id === 'clients' && manager[0].threads === true && manager[0].unread === 2, 'менеджер: «Клиенты» первой — из диалогов, число непрочитанных')
ok(manager[1].id === 'colleagues', 'менеджер: остальные папки за ней')
ok(staffChatFolders({ folders: null, threads: null }).length === 1, 'ничего не загрузилось — одна пустая папка «Клиенты»')

if (failed) {
  console.error(`\nverify-staff-messenger: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-staff-messenger: all passed')
