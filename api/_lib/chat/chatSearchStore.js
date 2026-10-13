/**
 * Поиск по одному диалогу (service role): переписка с клиентом — chat_messages, сотрудников — staff_dm_messages.
 * Доступ к диалогу проверяет вызывающий handler. Текст запроса в лог не пишем.
 */
import { CHAT_SEARCH_LIMIT, chatSearchPattern, chatTextMatches } from '../../../src/lib/chat/chatSearchCore.js'
import { rows } from '../inbox/inboxStore.js'
import { CHAT_MESSAGE_FIELDS } from './chatStore.js'
import { DM_MESSAGE_FIELDS } from './staffDmStore.js'

const TABLES = {
  chat: { messages: 'chat_messages', fields: CHAT_MESSAGE_FIELDS },
  dm: { messages: 'staff_dm_messages', fields: DM_MESSAGE_FIELDS },
}

/**
 * Строки сообщений с совпадением, новые сверху. Шаблон чуть шире (е/ё), лишнее отсекаем точной проверкой.
 * @param {'chat'|'dm'} scope
 */
export async function searchThreadMessages(db, scope, threadId, q) {
  const t = TABLES[scope]
  const found = await rows(
    db
      .from(t.messages)
      .select(t.fields)
      .eq('thread_id', threadId)
      .ilike('body', chatSearchPattern(q))
      .order('created_at', { ascending: false })
      .limit(CHAT_SEARCH_LIMIT * 2),
  )
  return found.filter((m) => chatTextMatches(m.body, q)).slice(0, CHAT_SEARCH_LIMIT)
}
