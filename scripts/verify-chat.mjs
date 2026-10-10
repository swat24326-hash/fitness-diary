/**
 * Переписка клиента: доступ по ролям (тренер / менеджер / управляющий / админ × вид диалога × клуб × тренер),
 * текст сообщения, «непрочитано», кому push и что в нём.
 * node scripts/verify-chat.mjs
 */
import {
  CHAT_KINDS,
  canStaffReadChat,
  canStaffWriteChat,
  chatKindsForStaff,
  chatPushAudience,
  chatStaffRole,
  clientChatKinds,
  isChatKind,
  isChatUnreadFor,
} from '../src/lib/chat/chatAccessCore.js'
import {
  buildChatMessageView,
  chatPreview,
  chatTextParts,
  chatTimeRu,
  chronological,
  mergeChatMessages,
  normalizeChatBody,
  CHAT_BODY_MAX,
} from '../src/lib/chat/chatMessageCore.js'
import {
  chatInitials,
  chatStaffReadOnlyRu,
  chatThreadPreviewRu,
  chatThreadTitleRu,
  chatUnreadBadge,
} from '../src/lib/chat/chatUiCore.js'
import { buildChatFeed, chatDayLabelRu, isEmojiOnly } from '../src/lib/chat/chatFeedCore.js'
import { CHAT_EMOJI_SETS, CHAT_RECENT_MAX, insertEmoji, pushRecentEmoji } from '../src/lib/chat/chatEmojiCore.js'
import { chatPeerReadAt, chatUnreadCount } from '../src/lib/chat/chatAccessCore.js'
import {
  CHAT_STICKERS,
  CHAT_STICKER_GROUPS,
  chatStickerLabel,
  isChatSticker,
  resolveChatOutgoing,
} from '../src/lib/chat/chatStickerCore.js'
import { buildChatPushPayload } from '../api/_lib/chat/chatPushJob.js'

let failed = 0
function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    failed += 1
  } else {
    console.log('ok:', msg)
  }
}

const CLUB = 'club-a'
const OTHER = 'club-b'
const client = { id: 'c1', club_id: CLUB, trainer_id: 't1', archived_at: null }
const archived = { ...client, archived_at: '2026-10-01T00:00:00Z' }

const admin = { isAdmin: true, user: { id: 'a1' }, profile: { club_id: null } }
const trainer = { isTrainer: true, user: { id: 't1' }, profile: { club_id: CLUB } }
const otherTrainer = { isTrainer: true, user: { id: 't2' }, profile: { club_id: CLUB } }
const sales = { isSalesManager: true, user: { id: 's1' }, profile: { club_id: CLUB } }
const salesOther = { isSalesManager: true, user: { id: 's2' }, profile: { club_id: OTHER } }
const supervisor = { isSupervisor: true, user: { id: 'u1' }, profile: { club_id: CLUB } }
const supervisorOther = { isSupervisor: true, user: { id: 'u2' }, profile: { club_id: OTHER } }
const supervisorNoClub = { isSupervisor: true, user: { id: 'u3' }, profile: {} }
const empty = { user: { id: 'x1' }, profile: { club_id: CLUB } }

// --- роли и виды
ok(isChatKind('trainer') && isChatKind('sales') && isChatKind('supervisor') && !isChatKind('admin'), 'виды диалогов')
ok(chatStaffRole({ isAdmin: true, isTrainer: true }) === 'admin', 'админ проверяется первым')
ok(chatStaffRole(empty) === null, 'пустая роль — null')
ok(chatKindsForStaff(admin).join() === CHAT_KINDS.join(), 'админ видит все виды')
ok(chatKindsForStaff(trainer).join() === 'trainer', 'тренер — только свой вид')
ok(chatKindsForStaff(sales).join() === 'sales', 'менеджер — только «Менеджер по продажам»')
ok(chatKindsForStaff(supervisor).join() === 'sales,supervisor', 'управляющий — менеджеры + свой')
ok(chatKindsForStaff(empty).length === 0, 'пустая роль — ничего')

// --- «Тренер»
ok(canStaffReadChat(trainer, 'trainer', client) && canStaffWriteChat(trainer, 'trainer', client), 'текущий тренер читает и пишет')
ok(!canStaffReadChat(otherTrainer, 'trainer', client), 'чужой (прежний) тренер не видит')
ok(canStaffReadChat(admin, 'trainer', client) && canStaffWriteChat(admin, 'trainer', client), 'админ читает и отвечает в «Тренер»')
ok(!canStaffReadChat(sales, 'trainer', client), 'менеджер не видит переписку с тренером')
ok(!canStaffReadChat(supervisor, 'trainer', client), 'управляющий не видит переписку с тренером')
ok(!canStaffReadChat(trainer, 'trainer', { ...client, trainer_id: null }), 'без тренера — никто из тренеров')

// --- «Менеджер по продажам»
ok(canStaffWriteChat(sales, 'sales', client), 'менеджер своего клуба пишет')
ok(!canStaffReadChat(salesOther, 'sales', client), 'менеджер чужого клуба не видит')
ok(canStaffWriteChat(supervisor, 'sales', client), 'управляющий клуба отвечает за менеджеров')
ok(!canStaffReadChat(supervisorOther, 'sales', client), 'управляющий чужого клуба не видит')
ok(canStaffWriteChat(admin, 'sales', client), 'админ отвечает в «Менеджер»')
ok(!canStaffReadChat(trainer, 'sales', client), 'тренер не видит переписку с менеджером')

// --- «Управляющий»
ok(canStaffWriteChat(supervisor, 'supervisor', client), 'управляющий клуба пишет')
ok(!canStaffReadChat(sales, 'supervisor', client), 'менеджер не видит переписку с управляющим')
ok(canStaffReadChat(admin, 'supervisor', client) && !canStaffWriteChat(admin, 'supervisor', client), 'админ только читает «Управляющий»')
ok(!canStaffReadChat(supervisorNoClub, 'supervisor', client), 'управляющий без клуба — нет доступа')

// --- прочее
ok(!canStaffReadChat(empty, 'sales', client), 'пустая роль — нет доступа')
ok(!canStaffReadChat(admin, 'trainer', null), 'нет клиента — нет доступа')
ok(!canStaffReadChat(admin, 'nope', client), 'неизвестный вид — нет доступа')
ok(canStaffReadChat(trainer, 'trainer', archived) && !canStaffWriteChat(trainer, 'trainer', archived), 'архив: читать можно, писать нельзя')
ok(clientChatKinds(client).join() === 'trainer,sales,supervisor', 'клиенту с тренером — три диалога')
ok(clientChatKinds({ ...client, trainer_id: null }).join() === 'sales,supervisor', 'без тренера — без диалога «Тренер»')

// --- текст
ok(normalizeChatBody('  привет  ').body === 'привет', 'обрезка пробелов')
ok(!normalizeChatBody('   \n ').ok, 'пустое не отправляем')
ok(normalizeChatBody('a\n\n\n\nb').body === 'a\n\nb', 'много пустых строк — одна')
ok(normalizeChatBody('x'.repeat(CHAT_BODY_MAX)).ok && !normalizeChatBody('x'.repeat(CHAT_BODY_MAX + 1)).ok, 'лимит длины')
ok(chatPreview('a\n  b') === 'a b', 'превью в одну строку')
ok(chatPreview('x'.repeat(200), 10).length === 10 && chatPreview('x'.repeat(200), 10).endsWith('…'), 'превью обрезано')
ok(chronological([{ id: 2 }, { id: 1 }]).map((m) => m.id).join() === '1,2', 'лента по возрастанию')
const names = new Map([['t1', 'Анна']])
const vStaff = buildChatMessageView({ id: 'm1', body: 'hi', created_at: 'x', author_side: 'staff', author_user_id: 't1' }, 'client', names)
ok(!vStaff.mine && vStaff.author_name === 'Анна', 'клиент видит имя сотрудника, сообщение не «моё»')
const vClient = buildChatMessageView({ id: 'm2', body: 'hi', created_at: 'x', author_side: 'client' }, 'client', names)
ok(vClient.mine && vClient.author_name === '', 'своё сообщение клиента — «моё», без имени')

const shown = [
  { id: 'a', created_at: '2026-10-10T10:00:00Z' },
  { id: 'b', created_at: '2026-10-10T10:01:00Z' },
]
const merged = mergeChatMessages(shown, [
  { id: 'b', created_at: '2026-10-10T10:01:00Z' },
  { id: 'c', created_at: '2026-10-10T10:02:00Z' },
])
ok(merged.map((m) => m.id).join() === 'a,b,c', 'склейка ленты: без дублей, по времени')
ok(mergeChatMessages(shown, [{ id: 'z', created_at: '2026-10-09T09:00:00Z' }])[0].id === 'z', 'старая страница — в начало')
const noon = new Date(2026, 9, 10, 12, 0)
ok(chatTimeRu(new Date(2026, 9, 10, 9, 5).toISOString(), noon) === '09:05', 'время сегодня — только часы')
ok(chatTimeRu(new Date(2026, 9, 9, 9, 5).toISOString(), noon) === '09.10 09:05', 'другой день — с датой')
ok(chatTimeRu('нет', noon) === '', 'плохая дата — пусто')
const parts = chatTextParts('Смотрите https://www.wildberries.ru/catalog/123/detail.aspx, норм?')
ok(
  parts.length === 3 && parts[1].href === 'https://www.wildberries.ru/catalog/123/detail.aspx' && parts[2].text === ', норм?',
  'ссылка Wildberries кликабельна, запятая после неё — текст',
)
ok(chatTextParts('без ссылок').length === 1 && !chatTextParts('без ссылок')[0].href, 'текст без ссылок — один кусок')
ok(!chatTextParts('javascript:alert(1)').some((p) => p.href), 'не http(s) — не ссылка')

// --- подписи
ok(chatThreadTitleRu('trainer', 'Анна') === 'Тренер · Анна' && chatThreadTitleRu('sales', '') === 'Менеджер по продажам', 'заголовок диалога')
ok(chatThreadPreviewRu({ last_preview: 'ок', last_author: 'client' }, 'client') === 'Вы: ок', 'своё последнее — «Вы: …»')
ok(chatThreadPreviewRu({ last_preview: 'ок', last_author: 'staff' }, 'client') === 'ок', 'чужое последнее — как есть')
ok(chatThreadPreviewRu({}, 'client') === 'Напишите, если есть вопрос', 'пустой диалог клиента — приглашение')
ok(chatStaffReadOnlyRu({ client: { archived: true } }).includes('архиве'), 'архив — объяснение')

// --- непрочитано
const t = { last_message_at: '2026-10-10T10:00:00Z', last_author: 'client', staff_read_at: null, client_read_at: '2026-10-10T10:00:00Z' }
ok(isChatUnreadFor('staff', t) && !isChatUnreadFor('client', t), 'новое от клиента — непрочитано у сотрудника')
ok(!isChatUnreadFor('staff', { ...t, staff_read_at: '2026-10-10T10:05:00Z' }), 'сотрудник открыл — прочитано')
ok(!isChatUnreadFor('client', null), 'нет диалога — нет точки')

// --- счётчик и галочки
ok(chatUnreadCount('staff', { ...t, staff_unread: 3 }) === 3, 'счётчик непрочитанных сотрудника')
ok(chatUnreadCount('staff', { ...t, staff_unread: 0 }) === 1, 'отставший счётчик у непрочитанного — минимум 1')
ok(chatUnreadCount('client', { ...t, client_unread: 5 }) === 0, 'своё последнее — 0, даже если счётчик не обнулён')
ok(chatPeerReadAt('client', { staff_read_at: 'S', client_read_at: 'C' }) === 'S', 'клиенту — когда прочитал сотрудник')
ok(chatPeerReadAt('staff', { staff_read_at: 'S', client_read_at: 'C' }) === 'C', 'сотруднику — когда прочитал клиент')
ok(chatUnreadBadge(0) === '' && chatUnreadBadge(7) === '7' && chatUnreadBadge(120) === '99+', 'кружок с числом')
ok(chatInitials('Тестова Анна') === 'ТА' && chatInitials('ольга') === 'О' && chatInitials('') === '', 'инициалы аватарки')

// --- лента как в Telegram
const day = (d, h, m) => new Date(2026, 9, d, h, m).toISOString()
const now = new Date(2026, 9, 10, 20, 0)
ok(chatDayLabelRu(day(10, 9, 0), now) === 'Сегодня' && chatDayLabelRu(day(9, 9, 0), now) === 'Вчера', 'плашки «Сегодня» / «Вчера»')
ok(chatDayLabelRu(day(1, 9, 0), now) === '1 октября', 'плашка с датой')
ok(chatDayLabelRu(new Date(2025, 0, 5).toISOString(), now) === '5 января 2025', 'прошлый год — с годом')
const feed = buildChatFeed(
  [
    { id: '1', created_at: day(9, 10, 0), side: 'client', mine: true, body: 'привет' },
    { id: '2', created_at: day(10, 10, 0), side: 'client', mine: true, body: 'есть вопрос' },
    { id: '3', created_at: day(10, 10, 2), side: 'client', mine: true, body: '👍' },
    { id: '4', created_at: day(10, 10, 3), side: 'staff', mine: false, author_name: 'Анна', body: 'да' },
    { id: '5', created_at: day(10, 10, 30), side: 'staff', mine: false, author_name: 'Анна', body: 'слушаю' },
  ],
  { now, peerReadAt: day(10, 10, 1) },
)
ok(feed.filter((x) => x.type === 'day').map((x) => x.label).join() === 'Вчера,Сегодня', 'плашки дней по порядку')
const msg = (id) => feed.find((x) => x.id === id)
ok(msg('2').groupStart && !msg('2').groupEnd && !msg('3').groupStart && msg('3').groupEnd, 'подряд за 5 минут — одна пачка')
ok(msg('1').groupEnd && msg('2').groupStart, 'другой день — новая пачка')
ok(msg('4').groupStart && msg('5').groupStart, 'перерыв больше 5 минут — новая пачка')
ok(msg('2').read && !msg('3').read && !msg('4').read, 'галочки: прочитано то, что раньше отметки собеседника; чужие без галочек')
ok(msg('3').big && !msg('2').big, 'сообщение из одного смайлика — крупно')
ok(isEmojiOnly('🔥🔥🔥') && isEmojiOnly('💪🏻') && isEmojiOnly('❤️') && isEmojiOnly('👍 👍'), 'смайлики с оттенком, сердце, пробелы')
ok(!isEmojiOnly('ок 👍') && !isEmojiOnly('123') && !isEmojiOnly('😀😀😀😀') && !isEmojiOnly(''), 'текст, цифры, больше трёх — обычный пузырь')

// --- смайлики
ok(CHAT_EMOJI_SETS.length >= 4 && CHAT_EMOJI_SETS.every((s) => s.items.length >= 20), 'наборы смайликов заполнены')
const ins = insertEmoji('Привет мир', 7, 7, '👋')
ok(ins.text === 'Привет 👋мир' && ins.caret === 7 + '👋'.length, 'смайлик в позицию курсора')
ok(insertEmoji('abc', 1, 2, '🔥').text === 'a🔥c', 'смайлик заменяет выделение')
ok(insertEmoji('abc', undefined, undefined, '🔥').text === 'abc🔥', 'без курсора — в конец')
const recent = pushRecentEmoji(['😀', '👍'], '👍')
ok(recent.join() === '👍,😀', 'недавние: повтор поднимается первым')
ok(pushRecentEmoji(Array.from({ length: 40 }, (_, i) => String(i)), 'x').length === CHAT_RECENT_MAX, 'недавних не больше лимита')

// --- стикеры
ok(CHAT_STICKERS.length >= 10 && new Set(CHAT_STICKERS.map((s) => s.id)).size === CHAT_STICKERS.length, 'стикеры: набор без повторов')
ok(CHAT_STICKERS.every((s) => /^[a-z0-9-]{1,32}$/.test(s.id) && s.label), 'id стикера проходит CHECK в базе, подпись есть')
ok(CHAT_STICKERS.every((s) => CHAT_STICKER_GROUPS.some((g) => g.id === s.group)), 'у каждого стикера своя группа')
const st = resolveChatOutgoing({ sticker: 'late', body: 'подмена' })
ok(st.ok && st.sticker === 'late' && st.body === 'Опаздываю ~10 минут', 'стикер: текст — подпись, присланный текст игнорируем')
ok(!resolveChatOutgoing({ sticker: '../evil.svg' }).ok, 'чужой стикер — ошибка, а не текст')
ok(!resolveChatOutgoing({ sticker: 'nope', body: 'привет' }).ok, 'неизвестный стикер с текстом — тоже ошибка')
const tx = resolveChatOutgoing({ body: '  привет ', sticker: '' })
ok(tx.ok && tx.body === 'привет' && tx.sticker === null, 'без стикера — обычный текст')
ok(!resolveChatOutgoing({}).ok, 'пусто — ошибка')
ok(isChatSticker('fire') && !isChatSticker('') && chatStickerLabel('x') === '', 'проверка id и подписи')
const sf = buildChatFeed([
  { id: 's1', created_at: day(10, 11, 0), side: 'staff', mine: false, body: 'Рекорд!', sticker: 'record' },
  { id: 's2', created_at: day(10, 11, 1), side: 'staff', mine: false, body: 'старый', sticker: 'unknown-old' },
], { now })
ok(sf.find((x) => x.id === 's1').big && sf.find((x) => x.id === 's1').sticker === 'record', 'стикер в ленте — крупно')
ok(sf.find((x) => x.id === 's2').sticker === null && !sf.find((x) => x.id === 's2').big, 'неизвестный стикер — показываем текстом')

// --- push
ok(chatPushAudience('trainer', 'client', client).userIds.join() === 't1', 'клиент → тренеру')
ok(chatPushAudience('trainer', 'client', { ...client, trainer_id: null }) === null, 'без тренера — пуша нет')
const salesAud = chatPushAudience('sales', 'client', client)
ok(salesAud.to === 'roles' && salesAud.roles.join() === 'sales' && salesAud.clubId === CLUB, 'клиент → менеджерам клуба')
ok(chatPushAudience('supervisor', 'client', client).roles.join() === 'supervisor', 'клиент → управляющему')
ok(chatPushAudience('sales', 'staff', client).to === 'client', 'сотрудник → клиенту')
const pToStaff = buildChatPushPayload({ kind: 'sales', authorSide: 'client', clientId: 'c1', clientName: 'Ольга', authorName: '', body: 'Можно перенести?' })
ok(pToStaff.title === 'Ольга' && pToStaff.url === '/messages/chat/c1/sales', 'пуш сотруднику: имя клиента и ссылка на диалог')
const pToClient = buildChatPushPayload({ kind: 'trainer', authorSide: 'staff', clientId: 'c1', clientName: 'Ольга', authorName: 'Анна', body: 'x'.repeat(200) })
ok(pToClient.title === 'Тренер · Анна' && pToClient.url === '/me/chat/trainer' && pToClient.body.length === 80, 'пуш клиенту: кто и 80 символов')

if (failed) {
  console.error(`\nverify-chat: ${failed} FAIL`)
  process.exit(1)
}
console.log('\nverify-chat: OK')
