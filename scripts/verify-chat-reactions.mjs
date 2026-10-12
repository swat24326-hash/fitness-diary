/**
 * Переписка: реакции на сообщения, как в Telegram — одна от человека, та же снимает, другая заменяет;
 * любой смайлик набора, «кто поставил», значок в списке диалогов.
 * node scripts/verify-chat-reactions.mjs
 */
import {
  CHAT_QUICK_REACTION,
  CHAT_REACTIONS,
  chatReactionNotifies,
  chatReactionWhoRu,
  chatReactionsByMessage,
  chatReactorKey,
  chatReactorSide,
  chatUnseenReaction,
  myChatReaction,
  normalizeChatReaction,
  patchChatReactions,
  summarizeChatReactions,
  toggleChatReaction,
} from '../src/lib/chat/chatReactionCore.js'
import { threadSummary } from '../src/lib/chat/chatContactsCore.js'
import { staffDmThreadForViewer } from '../src/lib/chat/staffDmAccessCore.js'

let failed = 0
function ok(cond, msg) {
  if (cond) console.log(`ok: ${msg}`)
  else {
    failed += 1
    console.error(`FAIL: ${msg}`)
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

ok(CHAT_REACTIONS.length === 6 && CHAT_REACTIONS[0] === '👍' && CHAT_QUICK_REACTION === '👍', 'полоска: 6 реакций, 👍 первым; двойной тап — 👍')
ok(same(normalizeChatReaction('🔥'), { ok: true, emoji: '🔥' }), 'смайлик из полоски — можно')
ok(normalizeChatReaction('🍕').ok && normalizeChatReaction('😴').ok, 'любой смайлик набора (стрелка «ещё») — можно')
ok(same(normalizeChatReaction(null), { ok: true, emoji: null }) && normalizeChatReaction('').emoji === null, 'пусто — снять свою')
ok(
  !normalizeChatReaction('<script>').ok && !normalizeChatReaction('👍👍').ok && !normalizeChatReaction('ок 👍').ok && !normalizeChatReaction('a').ok,
  'текст, два смайлика, смайлик с текстом — нельзя (сервер не хранит что попало)',
)

const CLIENT = chatReactorKey('client', 'c1')
const TRAINER = chatReactorKey('staff', 'u1')
const ADMIN = chatReactorKey('staff', 'u2')
ok(CLIENT === 'c:c1' && TRAINER === 'u:u1', 'клиент и сотрудник различаются, даже с одинаковым id')
ok(chatReactorSide(CLIENT) === 'client' && chatReactorSide(TRAINER) === 'staff', 'сторона по ключу')

const names = new Map([
  [CLIENT, 'Анна'],
  [TRAINER, 'Тренер Иван'],
  [ADMIN, 'Админ Ольга'],
])
const rows = [
  { message_id: 'm1', reactor: CLIENT, emoji: '👍' },
  { message_id: 'm1', reactor: TRAINER, emoji: '🔥' },
  { message_id: 'm1', reactor: ADMIN, emoji: '🔥' },
  { message_id: 'm2', reactor: TRAINER, emoji: '❤️' },
]
const byMsg = chatReactionsByMessage(rows, CLIENT, names)
ok(
  same(byMsg.get('m1'), [
    { emoji: '🔥', count: 2, mine: false, who: ['Тренер Иван', 'Админ Ольга'] },
    { emoji: '👍', count: 1, mine: true, who: ['Вы'] },
  ]),
  'больше голосов — левее; своя отмечена; кто поставил — по именам, я — «Вы»',
)
ok(same(byMsg.get('m2'), [{ emoji: '❤️', count: 1, mine: false, who: ['Тренер Иван'] }]) && !byMsg.has('m3'), 'по сообщениям раздельно; без реакций — нет плашек')
ok(
  same(summarizeChatReactions([{ reactor: ADMIN, emoji: '🙏' }, { reactor: TRAINER, emoji: '👍' }], TRAINER).map((r) => r.emoji), ['👍', '🙏']),
  'поровну — порядок полоски',
)
ok(summarizeChatReactions([{ reactor: ADMIN, emoji: '🍕' }], TRAINER)[0].who.length === 0, 'имя неизвестно — список пуст, без ошибки')
ok(myChatReaction(byMsg.get('m1')) === '👍' && myChatReaction([]) === null && myChatReaction(undefined) === null, 'моя реакция на сообщении')

ok(chatReactionWhoRu({ count: 2, who: ['Вы', 'Анна'] }) === 'Вы, Анна', 'подсказка: «Вы, Анна»')
ok(chatReactionWhoRu({ count: 3, who: ['Анна'] }) === 'Анна и ещё 2', 'имена не все — «и ещё N»')
ok(chatReactionWhoRu(undefined) === '', 'без плашки — пусто')

const put = toggleChatReaction([], '💪')
ok(put.emoji === '💪' && same(put.reactions, [{ emoji: '💪', count: 1, mine: true, who: ['Вы'] }]), 'поставить первую')
const off = toggleChatReaction(put.reactions, '💪')
ok(off.emoji === null && off.reactions.length === 0, 'та же ещё раз (или двойной тап по уже 👍) — снять')
const swap = toggleChatReaction(byMsg.get('m1'), '🔥')
ok(
  swap.emoji === '🔥' && same(swap.reactions, [{ emoji: '🔥', count: 3, mine: true, who: ['Вы', 'Тренер Иван', 'Админ Ольга'] }]),
  'другая — заменяет мою (👍 исчез, к 🔥 +1, «Вы» в начале)',
)
const join = toggleChatReaction([{ emoji: '❤️', count: 1, mine: false, who: ['Анна'] }], '❤️')
ok(join.emoji === '❤️' && same(join.reactions, [{ emoji: '❤️', count: 2, mine: true, who: ['Вы', 'Анна'] }]), 'тап по чужой плашке — присоединиться')
const leave = toggleChatReaction([{ emoji: '❤️', count: 2, mine: true, who: ['Вы', 'Анна'] }], '❤️')
ok(same(leave.reactions, [{ emoji: '❤️', count: 1, mine: false, who: ['Анна'] }]), 'снял свою — чужая остаётся')

const feed = [{ id: 'm1', body: 'a' }, { id: 'm2', body: 'b' }]
const patched = patchChatReactions(feed, 'm2', put.reactions)
ok(patched[1].reactions === put.reactions && patched[0] === feed[0] && feed[1].reactions === undefined, 'лента: меняется только нужное сообщение')
ok(patchChatReactions(null, 'm1', []) === null, 'лента ещё не загружена — без ошибки')

ok(chatReactionNotifies('staff', 'client') && !chatReactionNotifies('client', 'client'), 'значок — только автору сообщения, не на своё')
ok(chatReactionNotifies('u:a', 'u:b') && !chatReactionNotifies('u:a', 'u:a') && !chatReactionNotifies('', 'u:a'), 'у сотрудников — по человеку')

const T0 = '2026-10-13T10:00:00.000Z'
const T1 = '2026-10-13T11:00:00.000Z'
const fromClient = { last_reaction_at: T1, last_reaction_emoji: '👍', last_reaction_by: CLIENT }
ok(chatUnseenReaction('staff', fromClient) === '👍', 'клиент отреагировал — у сотрудника значок 👍')
ok(chatUnseenReaction('client', fromClient) === null, 'у самого клиента значка нет')
ok(chatUnseenReaction('staff', { ...fromClient, staff_reaction_seen_at: T1 }) === null, 'открыл диалог после реакции — значок погас')
ok(chatUnseenReaction('staff', { ...fromClient, staff_reaction_seen_at: T0 }) === '👍', 'открывал раньше реакции — значок горит')
ok(chatUnseenReaction('staff', { last_reaction_at: null, last_reaction_emoji: null }) === null && chatUnseenReaction('staff', null) === null, 'реакции нет / сняли — значка нет')
ok(threadSummary({ ...fromClient, last_message_at: T0, last_author: 'staff' }).reaction === '👍' && threadSummary(null).reaction === null, 'папки: значок в строке контакта')

const dm = { user_lo: 'a', user_hi: 'b', last_reaction_at: T1, last_reaction_emoji: '❤️', last_reaction_by: 'u:a', hi_reaction_seen_at: T0 }
ok(chatUnseenReaction('staff', staffDmThreadForViewer(dm, 'b')) === '❤️', 'коллега отреагировал — у меня значок')
ok(chatUnseenReaction('staff', staffDmThreadForViewer(dm, 'a')) === null, 'у того, кто поставил, значка нет')
ok(chatUnseenReaction('staff', staffDmThreadForViewer({ ...dm, hi_reaction_seen_at: T1 }, 'b')) === null, 'открыл личный диалог — погас')

if (failed) {
  console.error(`verify-chat-reactions: провалов ${failed}`)
  process.exit(1)
}
console.log('verify-chat-reactions: всё ок')
