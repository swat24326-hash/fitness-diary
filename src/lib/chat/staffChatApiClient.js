/** Переписка сотрудника с клиентами: /api/admin-data?action=chat. Только онлайн — сообщения живут на сервере. */
import { inboxApiCall } from '../inbox/inboxAdminApiClient.js'
import { STAFF_INBOX_CHANGED } from '../inbox/staffInboxApiClient.js'

/** @returns {Promise<{ threads: object[], attention: number }>} */
export function fetchStaffChats() {
  return inboxApiCall('chat', 'GET', { view: 'list' })
}

/** Последняя страница (сервер отмечает прочитанным — шапка перечитает счётчик) или более старая — before. */
export async function fetchStaffChatThread(clientId, kind, before) {
  const data = await inboxApiCall('chat', 'GET', { view: 'thread', client_id: clientId, kind, ...(before ? { before } : {}) })
  if (data?.marked_read) window.dispatchEvent(new Event(STAFF_INBOX_CHANGED))
  return data
}

/** @param {{ body: string } | { sticker: string }} outgoing */
export function sendStaffChatMessage(clientId, kind, outgoing) {
  return inboxApiCall('chat', 'POST', {}, { op: 'send', client_id: clientId, kind, ...outgoing })
}
