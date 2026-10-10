/** Запросы телефона тренера к /api/coach. Только онлайн — очередь sync и IndexedDB не трогаем. */
import { coachRequest } from './coachSession.js'

export const fetchCoachMe = () => coachRequest({ view: 'me' })

/** @returns {Promise<{ days: Array<{ date: string, label: string, items: object[] }> }>} */
export const fetchCoachSchedule = () => coachRequest({ view: 'schedule' })

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
