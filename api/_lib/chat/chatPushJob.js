/**
 * Push о новом сообщении в переписке. Сообщение уже сохранено — push только зовёт открыть.
 * Круглосуточно, как в мессенджере: человек написал сам. Тихие часы — только у рассылок и напоминаний.
 */
import { chatKindLabelRu, chatPushAudience } from '../../../src/lib/chat/chatAccessCore.js'
import { activeChatRecipientIds } from '../../../src/lib/chat/chatDeliveryCore.js'
import { CHAT_PUSH_PREVIEW_MAX, chatPreview } from '../../../src/lib/chat/chatMessageCore.js'
import { pickInboxStaffRecipients, inboxStaffRoleValues } from '../../../src/lib/inbox/inboxAudienceCore.js'
import { isWebPushConfigured, sendWebPushToRow } from '../webPushCore.js'
import { loadSubscriptions } from '../inbox/inboxPushJob.js'
import { rows } from '../inbox/inboxStore.js'
import { withLinkedTrainers } from './linkedStaffStore.js'

/** Одно устройство под двумя учётками связанной пары — один push. */
export function uniqueByEndpoint(subs) {
  const seen = new Set()
  return subs.filter((s) => {
    const key = String(s.endpoint ?? s.id)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Получатели-сотрудники + тренерские учётки связанных управляющих, без автора. */
export async function staffPushSubscriptions(db, userIds, excludeUserId = '') {
  const ids = (await withLinkedTrainers(db, userIds)).filter((id) => id !== String(excludeUserId ?? ''))
  if (!ids.length) return []
  return uniqueByEndpoint(await loadSubscriptions(db, true, ids.map((user_id) => ({ user_id }))))
}

/** @returns {'off'|null} null — можно слать (переписка и личные сообщения сотрудников) */
export function chatPushBlocker(configured = isWebPushConfigured()) {
  return configured ? null : 'off'
}

/**
 * @param {{ kind: string, authorSide: 'client'|'staff', clientId: string, clientName: string, authorName: string, body: string, silent?: boolean }} p
 * silent — «Отправить без звука»: уведомление придёт тихо
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
    ...(p.silent ? { silent: true } : {}),
  }
}

async function staffRecipients(db, audience, excludeUserId) {
  if (audience.to === 'users') {
    const ids = audience.userIds.map(String).filter(Boolean)
    if (!ids.length) return []
    const users = await rows(db.from('users').select('id, is_active').in('id', ids))
    return activeChatRecipientIds(ids, users, excludeUserId).map((user_id) => ({ user_id }))
  }
  const users = await rows(
    db.from('users').select('id, club_id, role, is_active').eq('club_id', audience.clubId).in('role', inboxStaffRoleValues(audience.roles)),
  )
  return pickInboxStaffRecipients({ users, roles: audience.roles, excludeUserId }).recipients
}

/** Фоном после ответа API: ошибки только в лог, сообщение не откатываем. */
export async function sendChatPush(db, { kind, authorSide, client, authorUserId, authorName, body, silent = false }, send = sendWebPushToRow) {
  if (chatPushBlocker()) return { sent: 0, expired: 0 }
  const audience = chatPushAudience(kind, authorSide, client)
  if (!audience) return { sent: 0, expired: 0 }
  const staff = audience.to !== 'client'
  const author = String(authorUserId ?? '')
  const recipients = staff ? await staffRecipients(db, audience, author) : [{ client_id: String(client.id) }]
  if (!recipients.length) return { sent: 0, expired: 0 }
  const subs = staff
    ? await staffPushSubscriptions(db, recipients.map((r) => String(r.user_id)), author)
    : await loadSubscriptions(db, false, recipients)
  const payload = buildChatPushPayload({ kind, authorSide, clientId: String(client.id), clientName: client.name, authorName, body, silent })
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
