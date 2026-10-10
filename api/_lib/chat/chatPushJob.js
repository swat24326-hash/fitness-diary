/**
 * Push о новом сообщении в переписке. Сообщение уже сохранено — push только зовёт открыть.
 * Тихие часы и отключённый web push — как у «Входящих» (inboxPushBlocker).
 */
import { chatKindLabelRu, chatPushAudience } from '../../../src/lib/chat/chatAccessCore.js'
import { CHAT_PUSH_PREVIEW_MAX, chatPreview } from '../../../src/lib/chat/chatMessageCore.js'
import { pickInboxStaffRecipients, inboxStaffRoleValues } from '../../../src/lib/inbox/inboxAudienceCore.js'
import { sendWebPushToRow } from '../webPushCore.js'
import { inboxPushBlocker, loadSubscriptions } from '../inbox/inboxPushJob.js'
import { rows } from '../inbox/inboxStore.js'

/**
 * @param {{ kind: string, authorSide: 'client'|'staff', clientId: string, clientName: string, authorName: string, body: string }} p
 */
export function buildChatPushPayload(p) {
  const toStaff = p.authorSide === 'client'
  const title = toStaff
    ? String(p.clientName || 'Клиент').trim()
    : [chatKindLabelRu(p.kind), String(p.authorName || '').trim()].filter(Boolean).join(' · ')
  return {
    title,
    body: chatPreview(p.body, CHAT_PUSH_PREVIEW_MAX),
    url: toStaff ? `/messages/chat/${p.clientId}/${p.kind}` : `/me/chat/${p.kind}`,
    tag: `chat-${p.clientId}-${p.kind}`,
  }
}

async function staffRecipients(db, audience, excludeUserId) {
  if (audience.to === 'users') return audience.userIds.filter((id) => id !== excludeUserId).map((user_id) => ({ user_id }))
  const users = await rows(
    db.from('users').select('id, club_id, role, is_active').eq('club_id', audience.clubId).in('role', inboxStaffRoleValues(audience.roles)),
  )
  return pickInboxStaffRecipients({ users, roles: audience.roles, excludeUserId }).recipients
}

/** Фоном после ответа API: ошибки только в лог, сообщение не откатываем. */
export async function sendChatPush(db, { kind, authorSide, client, authorUserId, authorName, body }, send = sendWebPushToRow) {
  if (inboxPushBlocker()) return { sent: 0, expired: 0 }
  const audience = chatPushAudience(kind, authorSide, client)
  if (!audience) return { sent: 0, expired: 0 }
  const staff = audience.to !== 'client'
  const recipients = staff ? await staffRecipients(db, audience, String(authorUserId ?? '')) : [{ client_id: String(client.id) }]
  if (!recipients.length) return { sent: 0, expired: 0 }
  const subs = await loadSubscriptions(db, staff, recipients)
  const payload = buildChatPushPayload({ kind, authorSide, clientId: String(client.id), clientName: client.name, authorName, body })
  const expired = []
  let sent = 0
  for (const s of subs) {
    const r = await send(s, payload)
    if (r.ok) sent += 1
    else if (r.expired) expired.push(s.id)
  }
  if (expired.length) {
    await rows(db.from(staff ? 'user_push_subscriptions' : 'client_push_subscriptions').delete().in('id', expired).select('id'))
  }
  return { sent, expired: expired.length }
}
