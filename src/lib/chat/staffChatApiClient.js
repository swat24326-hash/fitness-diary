/** Переписка сотрудника с клиентами: /api/admin-data?action=chat. Только онлайн — сообщения живут на сервере. */
import { inboxApiCall } from '../inbox/inboxAdminApiClient.js'
import { STAFF_INBOX_CHANGED } from '../inbox/staffInboxApiClient.js'
import { chatSeenParam } from './chatSeenCore.js'
import { CHAT_VIDEO_FETCH_MS, isVideoOutgoing, videoUploadQuery } from './chatVideoTransport.js'

const fileOpts = { timeoutMs: CHAT_VIDEO_FETCH_MS }

/** Видеокружок — бинарным запросом, куда — в адресе; остальное — JSON. */
function sendChat(target, outgoing) {
  if (isVideoOutgoing(outgoing)) {
    return inboxApiCall('chat', 'POST', videoUploadQuery(target, outgoing), null, { raw: outgoing.video, timeoutMs: CHAT_VIDEO_FETCH_MS })
  }
  return inboxApiCall('chat', 'POST', {}, { ...target, ...outgoing })
}

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

/**
 * Файлы диалога с клиентом: звук голосового ({ audio, mime }), «→ Аа» ({ done, text? }), фото / PDF ({ data, mime, name }),
 * видеокружок ({ blob, mime }) — сутки.
 */
export function staffChatVoice(clientId, kind) {
  const call = (op, opts) => (messageId) => inboxApiCall('chat', 'POST', {}, { op, client_id: clientId, kind, message_id: messageId }, opts)
  return { audio: call('voice-audio'), text: call('voice-text'), file: call('attach', fileOpts) }
}

export function staffDmVoice(userId) {
  const call = (op, opts) => (messageId) => inboxApiCall('chat', 'POST', {}, { op, user_id: userId, message_id: messageId }, opts)
  return { audio: call('dm-voice-audio'), text: call('dm-voice-text'), file: call('dm-attach', fileOpts) }
}

/** @param {{ body: string } | { sticker: string } | { audio: string, sec: number, wave: number[] } | { video: Blob, sec: number }} outgoing */
export function sendStaffDmMessage(userId, outgoing) {
  return sendChat({ op: 'dm-send', user_id: userId }, outgoing)
}

/** @param {{ body: string } | { sticker: string } | { video: Blob, sec: number }} outgoing */
export function sendStaffChatMessage(clientId, kind, outgoing) {
  return sendChat({ op: 'send', client_id: clientId, kind }, outgoing)
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
  send: (outgoing) => sendChat({ op: 'group-send', club_id: clubId }, outgoing),
  react: (messageId, emoji) => inboxApiCall('chat', 'POST', {}, { op: 'group-react', club_id: clubId, message_id: messageId, emoji }),
  search: (q) => inboxApiCall('chat', 'GET', { view: 'group-search', club_id: clubId, q }),
  mute: (muted) => inboxApiCall('chat', 'POST', {}, { op: 'group-mute', club_id: clubId, muted }),
  pin: (messageId) => inboxApiCall('chat', 'POST', {}, { op: 'group-pin', club_id: clubId, message_id: messageId }),
  readers: (messageId) => inboxApiCall('chat', 'GET', { view: 'group-readers', club_id: clubId, message_id: messageId }),
  voice: {
    audio: (messageId) => inboxApiCall('chat', 'POST', {}, { op: 'group-voice-audio', club_id: clubId, message_id: messageId }),
    text: (messageId) => inboxApiCall('chat', 'POST', {}, { op: 'group-voice-text', club_id: clubId, message_id: messageId }),
    file: (messageId) => inboxApiCall('chat', 'POST', {}, { op: 'group-attach', club_id: clubId, message_id: messageId }, fileOpts),
  },
})
