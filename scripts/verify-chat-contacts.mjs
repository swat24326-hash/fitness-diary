/**
 * Папки «Сообщений»: кто ярко (есть приложение), порядок, поиск, подписи папок.
 * node scripts/verify-chat-contacts.mjs
 */
import {
  CHAT_FOLDER_ADMIN,
  CHAT_FOLDER_CLIENTS,
  CHAT_FOLDER_COLLEAGUES,
  buildClientContacts,
  chatFolderLabelRu,
  chatFolderUnread,
  filterChatContacts,
  sortChatContacts,
} from '../src/lib/chat/chatContactsCore.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const thread = (clientId, at, extra = {}) => ({
  client_id: clientId,
  last_message_at: at,
  last_author: 'client',
  last_preview: 'Привет',
  staff_read_at: at,
  staff_unread: 0,
  ...extra,
})

const clients = [
  { id: 'a', name: 'Яковлева Ольга' },
  { id: 'b', name: 'Борисов Иван' },
  { id: 'c', name: 'Ёлкина Мария' },
  { id: 'd', name: 'Тестова Анна' },
  { id: 'e', name: 'Андреев Пётр' },
]
const contacts = buildClientContacts({
  clients,
  liveClientIds: ['a', 'd', 'e'],
  threads: [
    thread('a', '2026-10-10T10:00:00Z'),
    thread('d', '2026-10-11T09:00:00Z', { staff_read_at: '2026-10-10T00:00:00Z', staff_unread: 2 }),
    thread('b', '2026-10-11T12:00:00Z', { staff_read_at: null, staff_unread: 1 }),
  ],
})
const byId = Object.fromEntries(contacts.map((c) => [c.id, c]))

ok(byId.a.has_app && byId.e.has_app, 'есть вход в приложение — ярко')
ok(!byId.c.has_app, 'нет входа и нет переписки — тускло')
ok(byId.b.has_app, 'вход отозван, но клиент написал и ждёт ответа — ярко')
ok(byId.d.unread && byId.d.unread_count === 2, 'непрочитанное: число новых')
ok(!byId.a.unread, 'прочитанный диалог — без кружка')
ok(byId.e.has_thread === false && byId.e.last_message_at === null, 'без переписки — пустая сводка')
ok(byId.a.last_preview === 'Привет', 'превью последнего сообщения')

const order = sortChatContacts(contacts).map((c) => c.id)
ok(order.join(',') === 'b,d,a,e,c', `порядок: непрочитанные, свежее, имя, затем тусклые по алфавиту (${order.join(',')})`)
ok(
  sortChatContacts([
    { id: 'x', name: 'Борис', has_app: true, unread: false, last_message_at: null },
    { id: 'y', name: 'Анна', has_app: true, unread: false, last_message_at: null },
  ])
    .map((c) => c.id)
    .join(',') === 'y,x',
  'яркие без переписки — по алфавиту',
)
ok(sortChatContacts([]).length === 0 && sortChatContacts(undefined).length === 0, 'пустой список не падает')

ok(filterChatContacts(contacts, 'анна').map((c) => c.id).join(',') === 'd', 'поиск по части имени без учёта регистра')
ok(filterChatContacts(contacts, 'елкина').map((c) => c.id).join(',') === 'c', 'ё = е в поиске')
ok(filterChatContacts(contacts, '  ').length === contacts.length, 'пустой запрос — весь список')

ok(chatFolderUnread(contacts) === 2, 'на вкладке папки — число диалогов, ждущих ответа')
ok(chatFolderLabelRu(CHAT_FOLDER_CLIENTS, 'trainer') === 'Клиенты', 'папка «Клиенты»')
ok(chatFolderLabelRu(CHAT_FOLDER_COLLEAGUES, 'trainer') === 'Коллеги', 'тренеру вторая папка — «Коллеги»')
ok(chatFolderLabelRu(CHAT_FOLDER_COLLEAGUES, 'supervisor') === 'Тренеры', 'управляющему — «Тренеры»')
ok(chatFolderLabelRu(CHAT_FOLDER_ADMIN, 'trainer') === 'Администрация', 'папка «Администрация»')

if (failed) {
  console.error(`verify-chat-contacts: ${failed} failed`)
  process.exit(1)
}
console.log('verify-chat-contacts: all passed')
