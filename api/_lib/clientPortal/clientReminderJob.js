/**
 * Отправка напоминаний о завтрашней тренировке (cron на ВМ: scripts/client-reminders-vm.mjs).
 * Слот сначала занимаем в client_reminder_log, потом шлём: два параллельных запуска не продублируют.
 * Ничего не дошло — слот освобождаем, следующий запуск в окне 19:00–22:00 попробует снова.
 */
import { addCalendarDaysIso, todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { loadInChunks, runWithConcurrency } from '../batchCore.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { isWebPushConfigured, sendWebPushToRow } from '../webPushCore.js'
import { cleanClubName } from './clientManifestCore.js'
import { clientReminderKey, clubOpsMinutesNow, isClientReminderWindow, planClientReminders } from './clientReminderCore.js'

const LOG_KEEP_DAYS = 30
const SEND_PARALLEL = 8

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function deleteSubscriptions(db, ids) {
  return loadInChunks(ids, (part) => rows(db.from('client_push_subscriptions').delete().in('id', part).select('id')))
}

async function loadLiveSubscriptions(db) {
  const subs = await rows(db.from('client_push_subscriptions').select('id, client_id, session_id, endpoint, p256dh, auth'))
  if (!subs.length) return { subs: [], clients: [] }
  const sessionIds = [...new Set(subs.map((s) => String(s.session_id)))]
  const clientIds = [...new Set(subs.map((s) => String(s.client_id)))]
  const [sessions, clients] = await Promise.all([
    loadInChunks(sessionIds, (part) => rows(db.from('client_sessions').select('id, client_id, revoked_at').in('id', part))),
    loadInChunks(clientIds, (part) => rows(db.from('clients').select('id, club_id, archived_at').in('id', part))),
  ])
  const liveSessions = new Set(sessions.filter((s) => !s.revoked_at).map((s) => String(s.id)))
  const liveClients = new Map(clients.filter((c) => !c.archived_at).map((c) => [String(c.id), c]))
  const live = subs.filter((s) => liveSessions.has(String(s.session_id)) && liveClients.has(String(s.client_id)))
  const deadIds = subs.filter((s) => !liveSessions.has(String(s.session_id))).map((s) => s.id)
  if (deadIds.length) await deleteSubscriptions(db, deadIds)
  return { subs: live, clients: [...liveClients.values()] }
}

async function buildPlan(db, tomorrow) {
  const { subs, clients } = await loadLiveSubscriptions(db)
  if (!subs.length) return []
  const clubIds = [...new Set(clients.map((c) => String(c.club_id ?? '')).filter(Boolean))]
  if (!clubIds.length) return []
  const clientIds = clients.map((c) => String(c.id))
  const [entries, sent, clubs] = await Promise.all([
    rows(
      db
        .from('trainer_schedule_entries')
        .select('day_date, start_minutes, trainer_id, client_ids')
        .eq('day_date', tomorrow)
        .in('club_id', clubIds),
    ),
    loadInChunks(clientIds, (part) =>
      rows(db.from('client_reminder_log').select('client_id, start_minutes').eq('day_date', tomorrow).in('client_id', part)),
    ),
    rows(db.from('clubs').select('id, name').in('id', clubIds)),
  ])
  const trainerIds = [...new Set(entries.map((e) => String(e.trainer_id)))]
  const trainers = trainerIds.length ? await rows(db.from('users').select('id, name').in('id', trainerIds)) : []
  const clubName = new Map(clubs.map((c) => [String(c.id), cleanClubName(c.name)]))
  return planClientReminders({
    tomorrow,
    entries,
    subscriptions: subs,
    sentKeys: new Set(sent.map((r) => clientReminderKey(r.client_id, tomorrow, r.start_minutes))),
    trainerNames: new Map(trainers.map((u) => [String(u.id), String(u.name ?? '')])),
    clubTitles: new Map(clients.map((c) => [String(c.id), clubName.get(String(c.club_id)) || ''])),
  })
}

async function claimSlot(db, item) {
  const claimed = await rows(
    db
      .from('client_reminder_log')
      .upsert(
        { client_id: item.clientId, day_date: item.dayDate, start_minutes: item.startMinutes },
        { onConflict: 'client_id,day_date,start_minutes', ignoreDuplicates: true },
      )
      .select('client_id'),
  )
  return claimed.length > 0
}

async function releaseSlot(db, item) {
  await rows(
    db
      .from('client_reminder_log')
      .delete()
      .eq('client_id', item.clientId)
      .eq('day_date', item.dayDate)
      .eq('start_minutes', item.startMinutes)
      .select('client_id'),
  )
}

/**
 * @param {{ db?: object, now?: Date, send?: typeof sendWebPushToRow, dryRun?: boolean }} [opts]
 * dryRun — без окна и без отправки: сколько напоминаний ушло бы сейчас (проверка после установки cron).
 */
export async function runClientReminders({ db = createServiceDataClient(), now = new Date(), send = sendWebPushToRow, dryRun = false } = {}) {
  if (!dryRun && !isClientReminderWindow(clubOpsMinutesNow(now))) return { skipped: 'window' }
  if (!dryRun && !isWebPushConfigured()) return { skipped: 'vapid_not_configured' }
  const today = todayInTimeZoneIso(undefined, now)
  const tomorrow = addCalendarDaysIso(today, 1)
  const plan = await buildPlan(db, tomorrow)
  if (dryRun) return { dry_run: true, tomorrow, planned: plan.length }

  const result = { tomorrow, planned: plan.length, sent: 0, failed: 0, expired: 0 }
  const expiredIds = new Set()
  await runWithConcurrency(plan, SEND_PARALLEL, async (item) => {
    if (!(await claimSlot(db, item))) return
    let delivered = 0
    for (const row of item.rows) {
      if (expiredIds.has(row.id)) continue
      const r = await send(row, item.payload)
      if (r.ok) delivered += 1
      else if (r.expired) expiredIds.add(row.id)
      else result.failed += 1
    }
    if (delivered) result.sent += 1
    else await releaseSlot(db, item)
  })
  if (expiredIds.size) {
    await deleteSubscriptions(db, [...expiredIds])
    result.expired = expiredIds.size
  }
  await rows(db.from('client_reminder_log').delete().lt('day_date', addCalendarDaysIso(today, -LOG_KEEP_DAYS)).select('client_id'))
  return result
}
