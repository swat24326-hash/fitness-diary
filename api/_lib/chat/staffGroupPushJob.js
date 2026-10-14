/**
 * Push участникам чата клуба о новом сообщении. Сообщение уже сохранено — push только зовёт открыть.
 * Без автора и без тех, кто заглушил чат; управляющему со связанной тренерской учёткой — и на её устройства.
 */
import { buildStaffGroupPushPayload, staffGroupPushRecipients } from '../../../src/lib/chat/staffGroupCore.js'
import { sendWebPushToRow } from '../webPushCore.js'
import { rows } from '../inbox/inboxStore.js'
import { chatPushBlocker, staffPushSubscriptions } from './chatPushJob.js'

/** Фоном после ответа API: ошибки только в лог, сообщение не откатываем. Круглосуточно — как остальная переписка. */
export async function sendStaffGroupPush(db, { clubId, clubName, memberIds, mutedIds, authorId, authorName, body, silent = false }, send = sendWebPushToRow) {
  if (chatPushBlocker()) return { sent: 0, expired: 0 }
  const recipients = staffGroupPushRecipients(memberIds, mutedIds, authorId)
  if (!recipients.length) return { sent: 0, expired: 0 }
  const subs = await staffPushSubscriptions(db, recipients, String(authorId))
  const payload = buildStaffGroupPushPayload({ clubId, clubName, authorName, body, silent })
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
