/**
 * Напоминания тренеру за 15 минут до записи Ежедневника (cron на ВМ каждые 5 минут: scripts/schedule-reminders-vm.mjs).
 * Слот сначала занимаем в trainer_schedule_reminder_log, потом шлём; ничего не дошло — освобождаем,
 * следующий запуск, пока запись не началась, попробует снова.
 */
import { addCalendarDaysIso, todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { normalizeScheduleClientIds } from '../../../src/lib/trainer/trainerScheduleCore.js'
import { loadInChunks, runWithConcurrency } from '../batchCore.js'
import { clubOpsMinutesNow } from '../clientPortal/clientReminderCore.js'
import { createServiceDataClient } from '../pgRest/serviceClient.js'
import { isWebPushConfigured, sendWebPushToRow } from '../webPushCore.js'
import { SCHEDULE_REMINDER_LEAD_MIN, planScheduleReminders, scheduleReminderKey } from './scheduleReminderCore.js'

const LOG = 'trainer_schedule_reminder_log'
const LOG_KEEP_DAYS = 7
const SEND_PARALLEL = 8
const MISSING_SCHEMA = /does not exist|schedule_reminders|trainer_schedule_reminder_log/i

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function buildPlan(db, today, nowMinutes) {
  const entries = await rows(
    db
      .from('trainer_schedule_entries')
      .select('id, trainer_id, day_date, start_minutes, title, client_ids, kind, linked_training_id')
      .eq('day_date', today)
      .gt('start_minutes', nowMinutes)
      .lte('start_minutes', nowMinutes + SCHEDULE_REMINDER_LEAD_MIN)
      .is('linked_training_id', null),
  )
  if (!entries.length) return []
  const trainerIds = [...new Set(entries.map((e) => String(e.trainer_id)))]
  const entryIds = entries.map((e) => String(e.id))
  const clientIds = [...new Set(entries.flatMap((e) => normalizeScheduleClientIds(e.client_ids)))]
  const [subscriptions, sent, clients] = await Promise.all([
    rows(
      db
        .from('user_push_subscriptions')
        .select('id, user_id, endpoint, p256dh, auth, app, schedule_reminders')
        .in('user_id', trainerIds)
        .eq('schedule_reminders', true),
    ),
    loadInChunks(entryIds, (part) => rows(db.from(LOG).select('entry_id, start_minutes').eq('day_date', today).in('entry_id', part))),
    clientIds.length
      ? loadInChunks(clientIds, (part) => rows(db.from('clients').select('id, name').in('id', part)))
      : [],
  ])
  return planScheduleReminders({
    today,
    nowMinutes,
    entries,
    subscriptions,
    sentKeys: new Set(sent.map((r) => scheduleReminderKey(r.entry_id, today, r.start_minutes))),
    clientNameById: Object.fromEntries(clients.map((c) => [String(c.id), String(c.name ?? '')])),
  })
}

function slotRow(item) {
  return { entry_id: item.entryId, day_date: item.dayDate, start_minutes: item.startMinutes }
}

async function claimSlot(db, item) {
  const claimed = await rows(
    db.from(LOG).upsert(slotRow(item), { onConflict: 'entry_id,day_date,start_minutes', ignoreDuplicates: true }).select('entry_id'),
  )
  return claimed.length > 0
}

async function releaseSlot(db, item) {
  await rows(
    db
      .from(LOG)
      .delete()
      .eq('entry_id', item.entryId)
      .eq('day_date', item.dayDate)
      .eq('start_minutes', item.startMinutes)
      .select('entry_id'),
  )
}

/**
 * @param {{ db?: object, now?: Date, send?: typeof sendWebPushToRow, dryRun?: boolean }} [opts]
 * dryRun — без отправки: сколько напоминаний ушло бы сейчас (проверка после установки cron).
 */
export async function runScheduleReminders({ db = createServiceDataClient(), now = new Date(), send = sendWebPushToRow, dryRun = false } = {}) {
  if (!dryRun && !isWebPushConfigured()) return { skipped: 'vapid_not_configured' }
  const today = todayInTimeZoneIso(undefined, now)
  const nowMinutes = clubOpsMinutesNow(now)
  let plan
  try {
    plan = await buildPlan(db, today, nowMinutes)
  } catch (e) {
    if (MISSING_SCHEMA.test(String(e?.message ?? ''))) return { skipped: 'migration_pending' }
    throw e
  }
  if (dryRun) return { dry_run: true, today, now_minutes: nowMinutes, planned: plan.length }

  const result = { today, planned: plan.length, sent: 0, failed: 0, expired: 0 }
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
    await loadInChunks([...expiredIds], (part) => rows(db.from('user_push_subscriptions').delete().in('id', part).select('id')))
    result.expired = expiredIds.size
  }
  await rows(db.from(LOG).delete().lt('day_date', addCalendarDaysIso(today, -LOG_KEEP_DAYS)).select('entry_id'))
  return result
}
