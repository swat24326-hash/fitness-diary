/** «Входящие» сотрудника: /api/admin-data?action=my-inbox. Только онлайн — сообщения живут на сервере. */
import { inboxApiCall } from './inboxAdminApiClient.js'

/** Шапка перечитывает счётчик, когда сотрудник открыл или прошёл сообщение. */
export const STAFF_INBOX_CHANGED = 'fd-staff-inbox-changed'

/**
 * Число на конверте изменилось (push, опрос раз в 2 минуты, возврат в окно) — мессенджер перечитывает список,
 * чтобы конверт и список не расходились, даже если push до этого компьютера не дошёл.
 */
export const STAFF_ATTENTION_CHANGED = 'fd-staff-attention-changed'

function changed() {
  window.dispatchEvent(new Event(STAFF_INBOX_CHANGED))
}

/** @returns {Promise<{ items: object[], attention: number }>} */
export function fetchStaffInbox() {
  return inboxApiCall('my-inbox', 'GET', {})
}

export async function openStaffInboxItem(id) {
  const { item } = await inboxApiCall('my-inbox', 'POST', {}, { op: 'item', id })
  changed()
  return item
}

export async function answerStaffInboxSurvey(id, answers) {
  const { item } = await inboxApiCall('my-inbox', 'POST', {}, { op: 'answer', id, answers })
  changed()
  return item
}
