/**
 * Push собеседнику о личном сообщении сотрудника. Сообщение уже сохранено — push только зовёт открыть.
 * Адрес — планшетный /messages/dm/<автор>; телефон тренера получит /coach/dm/<автор> (pushTargetUrlCore).
 */
import { buildStaffDmPushPayload } from '../../../src/lib/chat/staffDmAccessCore.js'
import { sendWebPushToRow } from '../webPushCore.js'
import { rows } from '../inbox/inboxStore.js'
import { chatPushBlocker, staffPushSubscriptions } from './chatPushJob.js'

/**
 * Фоном после ответа API: ошибки только в лог, сообщение не откатываем. Круглосуточно — как переписка с клиентом.
 * Получатель-управляющий со связанной тренерской учёткой получит push и на планшет / телефон тренера.
 */
export async function sendStaffDmPush(db, { recipientId, authorId, authorName, body, silent = false }, send = sendWebPushToRow) {
  if (chatPushBlocker()) return { sent: 0, expired: 0 }
  const subs = await staffPushSubscriptions(db, [String(recipientId)], String(authorId))
  const payload = buildStaffDmPushPayload({ authorId: String(authorId), authorName, body, silent })
  const expired = []
  let sent = 0
  for (const s of subs) {
    const r = await send(s, payload)
    if (r.ok) sent += 1
    else if (r.expired) expired.push(s.id)
  }
  if (expired.length) await rows(db.from('user_push_subscriptions').delete().in('id', expired).select('id'))
  return { sent, expired: expired.length }
}
