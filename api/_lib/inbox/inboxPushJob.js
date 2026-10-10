/**
 * Push о новой рассылке на телефоны получателей. Сообщение уже лежит во «Входящих» —
 * push только зовёт открыть. Тихие часы (22:00–9:00) — не шлём ни клиентам, ни сотрудникам.
 */
import { isWebPushConfigured, sendWebPushToRow } from '../webPushCore.js'
import { cleanClubName } from '../clientPortal/clientManifestCore.js'
import { clubOpsMinutesNow, isClientQuietMinute } from '../clientPortal/clientReminderCore.js'
import { loadInChunks } from '../batchCore.js'
import { rows } from './inboxStore.js'

const PARALLEL = 8

/** @returns {'quiet'|'off'|null} null — можно слать */
export function inboxPushBlocker(now = new Date()) {
  if (!isWebPushConfigured()) return 'off'
  return isClientQuietMinute(clubOpsMinutesNow(now)) ? 'quiet' : null
}

export function buildInboxPushPayload(campaign, clubName) {
  const staff = campaign.audience === 'staff'
  const reward = !staff && campaign.kind === 'survey' && campaign.reward_points > 0 ? ` · +${campaign.reward_points} баллов` : ''
  return {
    title: cleanClubName(clubName) || 'Сообщение от клуба',
    body: `${campaign.kind === 'survey' ? 'Опрос' : 'Объявление'}: ${campaign.title}${reward}`,
    url: staff ? '/messages' : '/me/inbox',
    tag: `inbox-${campaign.id}`,
  }
}

/** Подписки получателей: клиент — только живая сессия приложения; сотрудник — все его устройства. */
export async function loadSubscriptions(db, staff, recipients) {
  if (staff) {
    const subs = await loadInChunks(
      recipients.map((r) => r.user_id),
      (part) => rows(db.from('user_push_subscriptions').select('id, user_id, endpoint, p256dh, auth, app').in('user_id', part)),
    )
    return subs.map((s) => ({ ...s, owner: String(s.user_id) }))
  }
  const subs = await loadInChunks(
    recipients.map((r) => r.client_id),
    (part) =>
      rows(db.from('client_push_subscriptions').select('id, client_id, session_id, endpoint, p256dh, auth').in('client_id', part)),
  )
  if (!subs.length) return []
  const sessionIds = [...new Set(subs.map((s) => String(s.session_id)))]
  const live = new Set(
    (
      await loadInChunks(sessionIds, (part) =>
        rows(db.from('client_sessions').select('id').is('revoked_at', null).in('id', part)),
      )
    ).map((s) => String(s.id)),
  )
  return subs.filter((s) => live.has(String(s.session_id))).map((s) => ({ ...s, owner: String(s.client_id) }))
}

/** Фоном после ответа API: ошибки только в лог, рассылку не откатываем. */
export async function sendInboxPush(db, campaign, recipients, send = sendWebPushToRow) {
  const staff = campaign.audience === 'staff'
  const queue = await loadSubscriptions(db, staff, recipients)
  if (!queue.length) return { sent: 0, expired: 0 }
  const clubIds = [...new Set(recipients.map((r) => r.club_id).filter(Boolean))]
  const clubs = clubIds.length ? await rows(db.from('clubs').select('id, name').in('id', clubIds)) : []
  const clubName = new Map(clubs.map((c) => [String(c.id), c.name]))
  const clubOf = new Map(recipients.map((r) => [String(r.user_id ?? r.client_id), r.club_id]))
  const expired = []
  let sent = 0
  async function worker() {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const r = await send(s, buildInboxPushPayload(campaign, clubName.get(String(clubOf.get(s.owner)))))
      if (r.ok) sent += 1
      else if (r.expired) expired.push(s.id)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  const table = staff ? 'user_push_subscriptions' : 'client_push_subscriptions'
  if (expired.length) await rows(db.from(table).delete().in('id', expired).select('id'))
  return { sent, expired: expired.length }
}
