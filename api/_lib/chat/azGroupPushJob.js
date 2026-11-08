/**
 * Push участникам группы АЗ о новом сообщении. Сообщение уже сохранено — push только зовёт открыть.
 * Без автора и без тех, кто заглушил чат. Инструктору — /messages?azGroup= (телефон сам откроет /coach/az-group), клиенту — /me/az-group/.
 */
import { AZ_GROUP_TITLE_RU, azGroupPushRecipients, buildAzGroupPushPayload } from '../../../src/lib/chat/azGroupCore.js'
import { sendWebPushToRow } from '../webPushCore.js'
import { loadSubscriptions } from '../inbox/inboxPushJob.js'
import { rows } from '../inbox/inboxStore.js'
import { chatPushBlocker, staffPushSubscriptions } from './chatPushJob.js'

async function deliver(subs, payload, expired, send) {
  let sent = 0
  for (const s of subs) {
    const r = await send(s, payload)
    if (r.ok) sent += 1
    else if (r.expired) expired.push(s.id)
  }
  return sent
}

/** Фоном после ответа API: ошибки только в лог, сообщение не откатываем. Круглосуточно — как остальная переписка. */
export async function sendAzGroupPush(
  db,
  { instructorUserId, instructorName, memberKeys, mutedKeys, authorKey, authorName, body, silent = false },
  send = sendWebPushToRow,
) {
  if (chatPushBlocker()) return { sent: 0, expired: 0 }
  const recipients = azGroupPushRecipients(memberKeys, mutedKeys, authorKey)
  const userIds = recipients.filter((k) => k.startsWith('u:')).map((k) => k.slice(2))
  const clientIds = recipients.filter((k) => k.startsWith('c:')).map((k) => k.slice(2))
  if (!userIds.length && !clientIds.length) return { sent: 0, expired: 0 }
  const authorUserId = String(authorKey ?? '').startsWith('u:') ? String(authorKey).slice(2) : ''
  const [staffSubs, clientSubs] = await Promise.all([
    userIds.length ? staffPushSubscriptions(db, userIds, authorUserId) : [],
    clientIds.length ? loadSubscriptions(db, false, clientIds.map((client_id) => ({ client_id }))) : [],
  ])
  const title = String(instructorName ?? '').trim() ? `${AZ_GROUP_TITLE_RU} · ${String(instructorName).trim()}` : ''
  const base = { instructorUserId, title, authorName, body, silent }
  const staffExpired = []
  const clientExpired = []
  const sent =
    (await deliver(staffSubs, buildAzGroupPushPayload({ ...base, forClient: false }), staffExpired, send)) +
    (await deliver(clientSubs, buildAzGroupPushPayload({ ...base, forClient: true }), clientExpired, send))
  if (staffExpired.length) await rows(db.from('user_push_subscriptions').delete().in('id', staffExpired).select('id'))
  if (clientExpired.length) await rows(db.from('client_push_subscriptions').delete().in('id', clientExpired).select('id'))
  return { sent, expired: staffExpired.length + clientExpired.length }
}
