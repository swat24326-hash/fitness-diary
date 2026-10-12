/**
 * Push клиенту «Тренер Анна: новое задание». Задание уже сохранено — push только зовёт открыть.
 * Сразу после push-record; в тихие часы 22:00–9:00 по часам клуба не шлём — утром догоняет cron
 * (scripts/client-reminders-vm.mjs → runClientPlanNotices). notified_at сначала занимаем, потом шлём: без дублей.
 */
import { loadSubscriptions } from '../inbox/inboxPushJob.js'
import { isWebPushConfigured, sendWebPushToRow } from '../webPushCore.js'
import { cleanClubName } from '../clientPortal/clientManifestCore.js'
import { clubOpsMinutesNow, isClientQuietMinute } from '../clientPortal/clientReminderCore.js'

/** Позже — уже не новость: задание из позавчера push не догоняет. */
export const CLIENT_PLAN_NOTICE_MAX_AGE_MS = 18 * 60 * 60 * 1000
const NOTICE_BATCH = 200

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export function buildClientPlanPushPayload({ kind, trainerName, clubName }) {
  const first = String(trainerName ?? '').trim().split(/\s+/)[0] ?? ''
  const what = kind === 'nutrition' ? 'рацион питания' : 'новое задание'
  return {
    title: String(clubName ?? '').trim() || 'Ваш клуб',
    body: first ? `Тренер ${first}: ${what}` : kind === 'nutrition' ? 'Рацион питания от тренера' : 'Новое задание от тренера',
    url: kind === 'nutrition' ? '/me/nutrition' : '/me/task',
    tag: `plan-${kind}`,
  }
}

async function claimNotice(db, id, now) {
  const claimed = await rows(
    db.from('client_plans').update({ notified_at: now.toISOString() }).eq('id', id).is('notified_at', null).select('id'),
  )
  return claimed.length > 0
}

async function sendNotice(db, plan, send) {
  const [trainer, club, subs] = await Promise.all([
    plan.sent_by ? rows(db.from('users').select('name').eq('id', plan.sent_by)) : [],
    plan.club_id ? rows(db.from('clubs').select('name').eq('id', plan.club_id)) : [],
    loadSubscriptions(db, false, [{ client_id: String(plan.client_id) }]),
  ])
  if (!subs.length) return { sent: 0 }
  const payload = buildClientPlanPushPayload({
    kind: plan.kind,
    trainerName: trainer[0]?.name,
    clubName: cleanClubName(club[0]?.name),
  })
  const expired = []
  let sent = 0
  for (const s of subs) {
    const r = await send(s, payload)
    if (r.ok) sent += 1
    else if (r.expired) expired.push(s.id)
  }
  if (expired.length) await rows(db.from('client_push_subscriptions').delete().in('id', expired).select('id'))
  return { sent }
}

/** @returns {Promise<{ sent: number } | { skipped: string }>} */
export async function notifyClientPlanSent(db, plan, { now = new Date(), send = sendWebPushToRow } = {}) {
  if (isClientQuietMinute(clubOpsMinutesNow(now))) return { skipped: 'quiet' }
  if (!isWebPushConfigured()) return { skipped: 'vapid_not_configured' }
  if (!(await claimNotice(db, plan.id, now))) return { skipped: 'claimed' }
  return sendNotice(db, plan, send)
}

/** Cron каждые 15 минут: то, что отправили в тихие часы. */
export async function runClientPlanNotices({ db, now = new Date(), send = sendWebPushToRow } = {}) {
  if (isClientQuietMinute(clubOpsMinutesNow(now))) return { skipped: 'quiet' }
  if (!isWebPushConfigured()) return { skipped: 'vapid_not_configured' }
  const since = new Date(now.getTime() - CLIENT_PLAN_NOTICE_MAX_AGE_MS).toISOString()
  const pending = await rows(
    db
      .from('client_plans')
      .select('id, client_id, club_id, kind, sent_by')
      .is('notified_at', null)
      .gte('sent_at', since)
      .order('sent_at', { ascending: true })
      .limit(NOTICE_BATCH),
  )
  let sent = 0
  for (const plan of pending) {
    if (!(await claimNotice(db, plan.id, now))) continue
    sent += (await sendNotice(db, plan, send)).sent
  }
  return { pending: pending.length, sent }
}
