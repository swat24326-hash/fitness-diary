/**
 * «Ответить» с цитатой (service role): переписка с клиентом — chat_messages, сотрудников — staff_dm_messages.
 * Отвечать можно только на сообщение того же диалога; цитату для ленты собирает chatReplyCore.js.
 */
import { normalizeChatReplyTo } from '../../../src/lib/chat/chatReplyCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { CHAT_MESSAGE_FIELDS } from './chatStore.js'
import { DM_MESSAGE_FIELDS } from './staffDmStore.js'

const TABLES = {
  chat: { messages: 'chat_messages', fields: CHAT_MESSAGE_FIELDS },
  dm: { messages: 'staff_dm_messages', fields: DM_MESSAGE_FIELDS },
}

/**
 * Сообщение, на которое отвечают, если оно из этого диалога; иначе null — отправим без цитаты, текст не теряем.
 * @param {'chat'|'dm'} scope
 */
export async function loadReplyTarget(db, scope, threadId, raw) {
  const id = normalizeChatReplyTo(raw)
  if (!id) return null
  const t = TABLES[scope]
  const found = await rows(db.from(t.messages).select(t.fields).eq('id', id).eq('thread_id', threadId).limit(1))
  return found[0] ?? null
}

/**
 * Исходные сообщения для цитат на странице ленты: что уже на странице — берём оттуда, остальное (старее) — из базы.
 * @param {'chat'|'dm'} scope
 * @returns {Promise<Map<string, object>>} id → строка сообщения
 */
export async function loadReplyTargets(db, scope, threadId, messages) {
  const byId = new Map((messages ?? []).map((m) => [String(m.id), m]))
  const missing = [...new Set((messages ?? []).map((m) => m.reply_to).filter(Boolean).map(String))].filter((id) => !byId.has(id))
  const out = new Map()
  if (missing.length) {
    const t = TABLES[scope]
    const found = await loadInChunks(missing, (part) => rows(db.from(t.messages).select(t.fields).eq('thread_id', threadId).in('id', part)))
    for (const m of found) byId.set(String(m.id), m)
  }
  for (const m of messages ?? []) {
    const target = m.reply_to ? byId.get(String(m.reply_to)) : null
    if (target) out.set(String(target.id), target)
  }
  return out
}
