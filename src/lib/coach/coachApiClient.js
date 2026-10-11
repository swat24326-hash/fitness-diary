/** Запросы телефона тренера к /api/coach. Только онлайн — очередь sync и IndexedDB не трогаем. */
import { coachRequest } from './coachSession.js'

/** @returns {Promise<{ name: string, club: { name: string, manifest_url: string } | null }>} */
export const fetchCoachMe = () => coachRequest({ view: 'me' })

/** Одноразовый вход для значка «Домой» на iPhone (этот же телефон). @returns {Promise<{ token: string, expires_at: string }>} */
export const requestCoachHandoff = () => coachRequest({}, { op: 'handoff' })

/** @returns {Promise<{ days: Array<{ date: string, label: string, items: object[] }> }>} */
export const fetchCoachSchedule = () => coachRequest({ view: 'schedule' })

/**
 * Ежедневник за период (не больше 62 дней).
 * @returns {Promise<{ entries: object[], clientNameById: Record<string, string>, trainingById: Record<string, { status: string }>, clients: Array<{ id: string, name: string }> }>}
 */
export const fetchCoachScheduleRange = (from, to) => coachRequest({ view: 'schedule-range', from, to })

/** baseUpdatedAt — метка записи, которую видел телефон: другая на сервере = 409 «обновите». */
export const saveCoachScheduleEntry = (entry, baseUpdatedAt) =>
  coachRequest({}, { op: 'schedule-save', entry, base_updated_at: baseUpdatedAt ?? null })

export const deleteCoachScheduleEntry = (id, baseUpdatedAt) =>
  coachRequest({}, { op: 'schedule-delete', id, base_updated_at: baseUpdatedAt ?? null })

/** @returns {Promise<{ created: number }>} */
export const saveCoachScheduleCopies = (entry, days) => coachRequest({}, { op: 'schedule-copies', entry, days })

/** @returns {Promise<{ threads: object[], attention: number }>} */
export const fetchCoachChats = () => coachRequest({ view: 'chats' })

export function fetchCoachChatThread(clientId, before) {
  return coachRequest({ view: 'chat-thread', client_id: clientId, ...(before ? { before } : {}) })
}

/** @param {{ body: string } | { sticker: string }} outgoing */
export function sendCoachChatMessage(clientId, outgoing) {
  return coachRequest({}, { op: 'chat-send', client_id: clientId, ...outgoing })
}

export const fetchCoachPushStatus = (endpoint) => coachRequest({ view: 'push-status', endpoint: endpoint || '' })

/** @param {{ endpoint: string, p256dh?: string, auth?: string, user_agent?: string }} sub */
export const subscribeCoachPush = (sub) => coachRequest({}, { op: 'push-subscribe', ...sub })

export const unsubscribeCoachPush = (endpoint) => coachRequest({}, { op: 'push-unsubscribe', endpoint })
