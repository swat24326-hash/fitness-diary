/**
 * Видеокружки: бинарный POST (Content-Type video/mp4|video/webm, тело — сами байты) → обычное тело отправки
 * с attach { kind: 'video', buffer, sec } — дальше те же пути, что у фото (доступ, лимит, хранилище, push).
 * Куда отправить — в адресе: op = chat-send | send | dm-send | group-send, kind, client_id | user_id | club_id,
 * sec, client_msg_id?, reply_to?, silent=1?. Содержимое видео в лог не пишем.
 */
import { videoMetaFromQuery } from '../../../src/lib/chat/chatVideoCore.js'

/** Какие отправки принимает каждая входная точка. */
export const VIDEO_OPS_CLIENT = ['chat-send']
export const VIDEO_OPS_STAFF = ['send', 'dm-send', 'group-send']
export const VIDEO_OPS_COACH = ['chat-send', 'dm-send', 'group-send']
const one = (v) => (Array.isArray(v) ? v[0] : v)

/** Тело пришло байтами (portableApiHost пропускает так только video/*). */
export function isVideoUpload(req) {
  return Buffer.isBuffer(req?.body)
}

/**
 * @param {string[]} ops отправки этой входной точки
 * @returns {Record<string, unknown>} тело как у JSON-отправки; чужой op — пустое (handler ответит 400)
 */
export function videoSendBody(req, ops) {
  const q = req?.query ?? {}
  const op = String(one(q.op) ?? '')
  if (!ops.includes(op)) return {}
  const meta = videoMetaFromQuery(q)
  const pick = (k) => (one(q[k]) == null ? undefined : String(one(q[k])))
  return {
    action: op,
    op,
    kind: pick('kind'),
    peer_user_id: pick('peer_user_id'),
    client_id: pick('client_id'),
    user_id: pick('user_id'),
    club_id: pick('club_id'),
    attach: { kind: 'video', buffer: req.body, sec: meta.sec },
    client_msg_id: meta.client_msg_id,
    reply_to: meta.reply_to,
    silent: meta.silent,
  }
}