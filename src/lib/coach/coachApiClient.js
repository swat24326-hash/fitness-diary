/** Запросы телефона тренера к /api/coach. Только онлайн — очередь sync и IndexedDB не трогаем. */
import { chatSeenParam } from '../chat/chatSeenCore.js'
import { buildClientJoinUrl } from '../client/clientJoinUrl.js'
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

/**
 * Свои «Активные» клиенты с абонементами (только просмотр).
 * @returns {Promise<{ today: string, clients: Array<{ id: string, name: string, phone: string, card_number: string,
 *   birth_date: string | null, lifecycle: string | null, last_training_date: string | null, memberships: object[] }> }>}
 */
export const fetchCoachClients = () => coachRequest({ view: 'clients' })

/** @returns {Promise<{ threads: object[], attention: number }>} */
export const fetchCoachChats = () => coachRequest({ view: 'chats' })

/** Папки «Сообщений»: люди с приложением сверху. @returns {Promise<{ role: string, folders: Array<{ id: string, label: string, unread: number, contacts: object[] }> }>} */
export const fetchCoachContacts = () => coachRequest({ view: 'contacts' })

/** Ссылка своему клиенту в приложение клуба. @returns {Promise<{ url: string, expiresAt: string }>} */
export async function createCoachClientInvite(clientId) {
  const data = await coachRequest({}, { op: 'client-invite', client_id: clientId })
  return { url: buildClientJoinUrl(window.location.origin, data.token), expiresAt: data.expires_at }
}

/** Переписка с коллегой / администрацией. */
export function fetchCoachDmThread(userId, before, seen) {
  return coachRequest({ view: 'dm-thread', user_id: userId, ...(before ? { before } : {}), ...chatSeenParam(seen) })
}

/** @param {{ body: string } | { sticker: string }} outgoing */
export function sendCoachDmMessage(userId, outgoing) {
  return coachRequest({}, { op: 'dm-send', user_id: userId, ...outgoing })
}

/** kind 'supervisor' — «Жалобы и предложения» (только тренеру, связанному с управляющим). */
export function fetchCoachChatThread(clientId, before, kind = 'trainer', seen) {
  return coachRequest({ view: 'chat-thread', client_id: clientId, kind, ...(before ? { before } : {}), ...chatSeenParam(seen) })
}

/** @param {{ body: string } | { sticker: string }} outgoing */
export function sendCoachChatMessage(clientId, outgoing, kind = 'trainer') {
  return coachRequest({}, { op: 'chat-send', client_id: clientId, kind, ...outgoing })
}

/** emoji null — снять свою реакцию. */
export function reactCoachChatMessage(clientId, messageId, emoji, kind = 'trainer') {
  return coachRequest({}, { op: 'chat-react', client_id: clientId, kind, message_id: messageId, emoji })
}

/** Поиск по диалогу. @returns {Promise<{ results: object[] }>} */
export const searchCoachChat = (clientId, q, kind = 'trainer') => coachRequest({ view: 'chat-search', client_id: clientId, kind, q })
export const searchCoachDm = (userId, q) => coachRequest({ view: 'dm-search', user_id: userId, q })
/** Голосовые: звук ({ audio, mime }, сутки) и «→ Аа» ({ done, text? } — спрашивать, пока не done). */
export function coachChatVoice(clientId, kind = 'trainer') {
  const call = (op) => (messageId) => coachRequest({}, { op, client_id: clientId, kind, message_id: messageId })
  return { audio: call('chat-voice-audio'), text: call('chat-voice-text') }
}

export function coachDmVoice(userId) {
  const call = (op) => (messageId) => coachRequest({}, { op, user_id: userId, message_id: messageId })
  return { audio: call('dm-voice-audio'), text: call('dm-voice-text') }
}

export function reactCoachDmMessage(userId, messageId, emoji) {
  return coachRequest({}, { op: 'dm-react', user_id: userId, message_id: messageId, emoji })
}

/** Чат своего клуба (клуб сервер берёт из учётки) — тот же набор вызовов, что staffGroupApi планшета. */
export const coachGroupApi = Object.freeze({
  load: (before, seen) => coachRequest({ view: 'group-thread', ...(before ? { before } : {}), ...chatSeenParam(seen) }),
  send: (outgoing) => coachRequest({}, { op: 'group-send', ...outgoing }),
  react: (messageId, emoji) => coachRequest({}, { op: 'group-react', message_id: messageId, emoji }),
  search: (q) => coachRequest({ view: 'group-search', q }),
  mute: (muted) => coachRequest({}, { op: 'group-mute', muted }),
  pin: (messageId) => coachRequest({}, { op: 'group-pin', message_id: messageId }),
  readers: (messageId) => coachRequest({ view: 'group-readers', message_id: messageId }),
  voice: Object.freeze({
    audio: (messageId) => coachRequest({}, { op: 'group-voice-audio', message_id: messageId }),
    text: (messageId) => coachRequest({}, { op: 'group-voice-text', message_id: messageId }),
  }),
})

export const fetchCoachPushStatus = (endpoint) => coachRequest({ view: 'push-status', endpoint: endpoint || '' })

/** @param {{ endpoint: string, p256dh?: string, auth?: string, user_agent?: string }} sub */
export const subscribeCoachPush = (sub) => coachRequest({}, { op: 'push-subscribe', ...sub })

export const unsubscribeCoachPush = (endpoint) => coachRequest({}, { op: 'push-unsubscribe', endpoint })

/** Напоминания Ежедневника на этом телефоне: без scheduleReminders — чтение. */
export const coachPushPrefs = (endpoint, scheduleReminders) =>
  coachRequest({}, { op: 'push-prefs', endpoint, ...(typeof scheduleReminders === 'boolean' ? { schedule_reminders: scheduleReminders } : {}) })
