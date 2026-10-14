/** Переписка сотрудника с клиентами: /api/admin-data?action=chat. Только онлайн — сообщения живут на сервере. */
import { inboxApiCall } from '../inbox/inboxAdminApiClient.js'
import { STAFF_INBOX_CHANGED } from '../inbox/staffInboxApiClient.js'
import { chatSeenParam } from './chatSeenCore.js'

/** @returns {Promise<{ threads: object[], attention: number }>} */
export function fetchStaffChats() {
  return inboxApiCall('chat', 'GET', { view: 'list' })
}

/** Папки «Сообщений» (люди с приложением сверху). @returns {Promise<{ role: string, folders: object[] }>} */
export function fetchStaffChatContacts() {
  return inboxApiCall('chat', 'GET', { view: 'contacts' })
}

/**
 * Последняя страница (сервер отмечает прочитанным — шапка перечитает счётчик) или более старая — before.
 * seen=false — человек читает историю выше, новое не на экране: не отмечать.
 */
export async function fetchStaffChatThread(clientId, kind, before, seen) {
  const data = await inboxApiCall('chat', 'GET', { view: 'thread', client_id: clientId, kind, ...(before ? { before } : {}), ...chatSeenParam(seen) })
  if (data?.marked_read) window.dispatchEvent(new Event(STAFF_INBOX_CHANGED))
  return data
}

/** Переписка с коллегой / администрацией; как и с клиентом, открытие отмечает прочитанным. */
export async function fetchStaffDmThread(userId, before, seen) {
  const data = await inboxApiCall('chat', 'GET', { view: 'dm-thread', user_id: userId, ...(before ? { before } : {}), ...chatSeenParam(seen) })
  if (data?.marked_read) window.dispatchEvent(new Event(STAFF_INBOX_CHANGED))
  return data
}

/** Поиск по диалогу с клиентом / коллегой. @returns {Promise<{ results: object[] }>} */
export function searchStaffChat(clientId, kind, q) {
  return inboxApiCall('chat', 'GET', { view: 'search', client_id: clientId, kind, q })
}

export function searchStaffDm(userId, q) {
  return inboxApiCall('chat', 'GET', { view: 'dm-search', user_id: userId, q })
}

/** Голосовые диалога с клиентом: звук ({ audio, mime }, сутки) и «→ Аа» ({ done, text? } — спрашивать, пока не done). */
export function staffChatVoice(clientId, kind) {
  const call = (op) => (messageId) => inboxApiCall('chat', 'POST', {}, { op, client_id: clientId, kind, message_id: messageId })
  return { audio: call('voice-audio'), text: call('voice-text') }
}

export function staffDmVoice(userId) {
  const call = (op) => (messageId) => inboxApiCall('chat', 'POST', {}, { op, user_id: userId, message_id: messageId })
  return { audio: call('dm-voice-audio'), text: call('dm-voice-text') }
}

/** @param {{ body: string } | { sticker: string } | { audio: string, sec: number, wave: number[] }} outgoing */
export function sendStaffDmMessage(userId, outgoing) {
  return inboxApiCall('chat', 'POST', {}, { op: 'dm-send', user_id: userId, ...outgoing })
}

/** @param {{ body: string } | { sticker: string }} outgoing */
export function sendStaffChatMessage(clientId, kind, outgoing) {
  return inboxApiCall('chat', 'POST', {}, { op: 'send', client_id: clientId, kind, ...outgoing })
}

/** emoji null — снять свою реакцию. */
export function reactStaffChatMessage(clientId, kind, messageId, emoji) {
  return inboxApiCall('chat', 'POST', {}, { op: 'react', client_id: clientId, kind, message_id: messageId, emoji })
}

export function reactStaffDmMessage(userId, messageId, emoji) {
  return inboxApiCall('chat', 'POST', {}, { op: 'dm-react', user_id: userId, message_id: messageId, emoji })
}

/** Чат клуба: те же вызовы, что у личной переписки, с club_id вместо собеседника. */
export const staffGroupApi = (clubId) => ({
  async load(before, seen) {
    const data = await inboxApiCall('chat', 'GET', { view: 'group-thread', club_id: clubId, ...(before ? { before } : {}), ...chatSeenParam(seen) })
    if (data?.marked_read) window.dispatchEvent(new Event(STAFF_INBOX_CHANGED))
    return data
  },
  send: (outgoing) => inboxApiCall('chat', 'POST', {}, { op: 'group-send', club_id: clubId, ...outgoing }),
  react: (messageId, emoji) => inboxApiCall('chat', 'POST', {}, { op: 'group-react', club_id: clubId, message_id: messageId, emoji }),
  search: (q) => inboxApiCall('chat', 'GET', { view: 'group-search', club_id: clubId, q }),
  mute: (muted) => inboxApiCall('chat', 'POST', {}, { op: 'group-mute', club_id: clubId, muted }),
  pin: (messageId) => inboxApiCall('chat', 'POST', {}, { op: 'group-pin', club_id: clubId, message_id: messageId }),
  readers: (messageId) => inboxApiCall('chat', 'GET', { view: 'group-readers', club_id: clubId, message_id: messageId }),
  voice: {
    audio: (messageId) => inboxApiCall('chat', 'POST', {}, { op: 'group-voice-audio', club_id: clubId, message_id: messageId }),
    text: (messageId) => inboxApiCall('chat', 'POST', {}, { op: 'group-voice-text', club_id: clubId, message_id: messageId }),
  },
})
