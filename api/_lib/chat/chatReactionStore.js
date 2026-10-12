/**
 * Реакции на сообщения (service role): переписка с клиентом — chat_*, сотрудников — staff_dm_*.
 * Доступ к диалогу проверяет вызывающий handler; здесь — что сообщение из этого диалога, запись, чтение,
 * имена «кто поставил» и значок реакции в списке диалогов (last_reaction_* у диалога).
 */
import {
  CHAT_REACTION_GONE_RU,
  chatReactionNotifies,
  chatReactionsByMessage,
  chatReactorSide,
  normalizeChatReaction,
  summarizeChatReactions,
} from '../../../src/lib/chat/chatReactionCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { loadStaffNames } from './chatStore.js'

const TABLES = {
  chat: { reactions: 'chat_message_reactions', messages: 'chat_messages', threads: 'chat_threads', author: 'author_side, author_user_id' },
  dm: { reactions: 'staff_dm_message_reactions', messages: 'staff_dm_messages', threads: 'staff_dm_threads', author: 'author_user_id' },
}
const FIELDS = 'message_id, reactor, emoji'
const UNAVAILABLE_RU = 'Реакции пока недоступны — попробуйте позже'

function isMissingReactionTable(e) {
  const msg = String(e?.message ?? '')
  return /_message_reactions/.test(msg) && /does not exist|relation/i.test(msg)
}

/**
 * reactor → имя: сотрудники из users, клиент — из clientNames (id клиента → имя).
 * @param {Map<string, string>} [clientNames]
 */
async function reactorNames(db, list, clientNames) {
  const staffIds = list.filter((r) => chatReactorSide(r.reactor) === 'staff').map((r) => r.reactor.slice(2))
  const staff = await loadStaffNames(db, staffIds)
  const out = new Map()
  for (const r of list) {
    const id = r.reactor.slice(2)
    const name = chatReactorSide(r.reactor) === 'client' ? clientNames?.get(id) : staff.get(id)
    if (name) out.set(r.reactor, name)
  }
  return out
}

/**
 * Плашки реакций для страницы ленты. До миграции — пусто, лента открывается как раньше.
 * @param {'chat'|'dm'} scope
 * @param {Map<string, string>} [clientNames] id клиента → имя (для «кто поставил»)
 */
export async function loadReactionsFor(db, scope, messageIds, viewerKey, clientNames) {
  const ids = [...new Set((messageIds ?? []).map(String))]
  if (!ids.length) return new Map()
  try {
    const found = await loadInChunks(ids, (part) => rows(db.from(TABLES[scope].reactions).select(FIELDS).in('message_id', part)))
    return chatReactionsByMessage(found, viewerKey, await reactorNames(db, found, clientNames))
  } catch (e) {
    if (isMissingReactionTable(e)) return new Map()
    throw e
  }
}

/** Ключ автора сообщения для сравнения с тем, кто ставит: в переписке с клиентом — сторона, у сотрудников — человек. */
function authorKey(scope, message) {
  if (scope === 'chat') return message.author_side
  return message.author_user_id ? `u:${message.author_user_id}` : ''
}

/** Значок в списке у автора сообщения: поставил — показать, снял свою последнюю — убрать. */
async function updateThreadBadge(db, scope, threadId, { message, reactor, emoji }) {
  const t = TABLES[scope]
  const notifies = chatReactionNotifies(authorKey(scope, message), scope === 'chat' ? chatReactorSide(reactor) : reactor)
  if (emoji && notifies) {
    const patch = { last_reaction_at: new Date().toISOString(), last_reaction_emoji: emoji, last_reaction_by: reactor }
    await rows(db.from(t.threads).update(patch).eq('id', threadId).select('id'))
  } else if (!emoji) {
    const clear = { last_reaction_at: null, last_reaction_emoji: null, last_reaction_by: null }
    await rows(db.from(t.threads).update(clear).eq('id', threadId).eq('last_reaction_by', reactor).select('id'))
  }
}

/**
 * Поставить / заменить / снять (emoji null) свою реакцию.
 * @param {'chat'|'dm'} scope
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function setMessageReaction(db, scope, { threadId, messageId, reactor, emoji, clientNames }) {
  const checked = normalizeChatReaction(emoji)
  if (!checked.ok) return { status: 400, body: { error: checked.error } }
  const t = TABLES[scope]
  const id = isInboxUuid(messageId) ? String(messageId).trim() : ''
  const found = id ? await rows(db.from(t.messages).select(`id, ${t.author}`).eq('id', id).eq('thread_id', threadId).limit(1)) : []
  if (!found.length) return { status: 404, body: { error: CHAT_REACTION_GONE_RU } }
  try {
    if (checked.emoji) {
      await rows(db.from(t.reactions).upsert({ message_id: id, reactor, emoji: checked.emoji }, { onConflict: 'message_id,reactor' }).select('message_id'))
    } else {
      await rows(db.from(t.reactions).delete().eq('message_id', id).eq('reactor', reactor).select('message_id'))
    }
    await updateThreadBadge(db, scope, threadId, { message: found[0], reactor, emoji: checked.emoji })
    const list = await rows(db.from(t.reactions).select(FIELDS).eq('message_id', id))
    const names = await reactorNames(db, list, clientNames)
    return { status: 200, body: { message_id: id, reactions: summarizeChatReactions(list, reactor, names) } }
  } catch (e) {
    if (!isMissingReactionTable(e)) throw e
    return { status: 503, body: { error: UNAVAILABLE_RU } }
  }
}

/**
 * Открыл диалог — значок реакции в списке гаснет.
 * @param {'chat'|'dm'} scope
 * @param {string} column client_reaction_seen_at | staff_reaction_seen_at | lo_… | hi_…
 */
export async function markReactionSeen(db, scope, threadId, column) {
  await rows(db.from(TABLES[scope].threads).update({ [column]: new Date().toISOString() }).eq('id', threadId).select('id'))
}
