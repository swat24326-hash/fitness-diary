/**
 * Воскресное авто-ДЗ: cron на ВМ каждые 15 минут (scripts/client-reminders-vm.mjs).
 * Работает в воскресенье 10:00–22:00 по часам клуба. id задания постоянный от клиента и даты —
 * повторный запуск ничего не дублирует. Push клиенту — как у задания с планшета.
 */
import { calendarDayInTimeZoneIso, calendarDayStartUtcIso, todayInTimeZoneIso } from '../../../src/lib/dateRu.js'
import { normalizeClientPlanPushPayload } from '../../../src/lib/clientPlans/clientPlanCore.js'
import {
  HOMEWORK_AUTO_MANUAL_DAYS,
  HOMEWORK_AUTO_SEND_FROM_MIN,
  HOMEWORK_AUTO_SEND_TO_MIN,
  addDaysIso,
  buildHomeworkAutoPlan,
  homeworkAutoHoldReason,
  homeworkAutoPlanId,
  isSundayIso,
  normalizeHomeworkAutoRow,
} from '../../../src/lib/homework/auto/homeworkAutoScheduleCore.js'
import { mergeHomeworkLibrary } from '../../../src/lib/homework/library/homeworkLibraryOverridesCore.js'
import { clubOpsMinutesNow } from '../clientPortal/clientReminderCore.js'
import { loadHomeworkLibraryRows } from '../homeworkLibrary/homeworkLibraryRows.js'
import { notifyClientPlanSent } from '../clientPlans/clientPlanNotify.js'

const BATCH = 200

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function byKey(list, key) {
  return new Map(list.map((r) => [String(r[key]), r]))
}

async function sendBatch(db, batch, { sunday, now, notify, stats, library }) {
  const ids = batch.map((r) => r.client_id)
  const planIds = batch.map((r) => homeworkAutoPlanId(r.client_id, sunday))
  const manualSince = calendarDayStartUtcIso(addDaysIso(sunday, -HOMEWORK_AUTO_MANUAL_DAYS))
  const [clients, health, screenings, done, recent] = await Promise.all([
    rows(db.from('clients').select('id, trainer_id, club_id, archived_at').in('id', ids)),
    rows(db.from('health_cards').select('client_id, diseases, contraindications').in('client_id', ids)),
    rows(db.from('health_screenings').select('client_id, answers').in('client_id', ids)),
    rows(db.from('client_plans').select('id').in('id', planIds)),
    rows(db.from('client_plans').select('id, client_id, sent_at').in('client_id', ids).eq('kind', 'homework').gte('sent_at', manualSince)),
  ])
  const clientById = byKey(clients, 'id')
  const healthById = byKey(health, 'client_id')
  const screeningById = byKey(screenings, 'client_id')
  const doneIds = new Set(done.map((r) => String(r.id)))
  const lastManual = new Map()
  for (const p of recent) {
    if (planIds.includes(String(p.id))) continue
    const day = calendarDayInTimeZoneIso(p.sent_at)
    const cid = String(p.client_id)
    if (day > (lastManual.get(cid) ?? '')) lastManual.set(cid, day)
  }

  for (const row of batch) {
    const cid = String(row.client_id)
    if (doneIds.has(homeworkAutoPlanId(cid, sunday))) {
      stats.already += 1
      continue
    }
    const client = clientById.get(cid) ?? null
    const screening = screeningById.get(cid)?.answers ?? null
    const reason = homeworkAutoHoldReason({
      row,
      client,
      health: healthById.get(cid),
      screening,
      sundayIso: sunday,
      lastManualDay: lastManual.get(cid) ?? null,
    })
    if (reason) {
      stats.held[reason] = (stats.held[reason] ?? 0) + 1
      continue
    }
    const built = buildHomeworkAutoPlan({ row, client, screening, sundayIso: sunday, now, library })
    const prep = built.ok ? normalizeClientPlanPushPayload(built.plan) : { ok: false }
    if (!prep.ok) {
      stats.failed += 1
      continue
    }
    const { error } = await db.from('client_plans').insert(prep.data)
    if (error) {
      if (error.code === '23505') stats.already += 1
      else {
        stats.failed += 1
        console.warn('[homework-auto] insert', cid, error.code || '', error.message || '')
      }
      continue
    }
    stats.sent += 1
    await notify(db, prep.data, { now }).catch((e) => console.warn('[homework-auto] push', e?.message || e))
  }
}

/** @returns {Promise<{ skipped: string } | { sunday: string, sent: number, already: number, failed: number, held: Record<string, number> }>} */
export async function runHomeworkAutoSend({ db, now = new Date(), notify = notifyClientPlanSent } = {}) {
  const sunday = todayInTimeZoneIso(undefined, now)
  const minutes = clubOpsMinutesNow(now)
  if (!isSundayIso(sunday) || minutes < HOMEWORK_AUTO_SEND_FROM_MIN || minutes >= HOMEWORK_AUTO_SEND_TO_MIN) {
    return { skipped: 'not_sunday_window' }
  }
  const stats = { sunday, sent: 0, already: 0, failed: 0, held: {} }
  const library = mergeHomeworkLibrary(await loadHomeworkLibraryRows(db))
  let after = '00000000-0000-0000-0000-000000000000'
  for (;;) {
    const page = await rows(db.from('homework_auto').select('*').eq('enabled', true).gt('id', after).order('id', { ascending: true }).limit(BATCH))
    if (!page.length) break
    after = String(page[page.length - 1].id)
    const valid = page.map((r) => normalizeHomeworkAutoRow(r)).filter((r) => r.ok).map((r) => r.data)
    stats.failed += page.length - valid.length
    if (valid.length) await sendBatch(db, valid, { sunday, now, notify, stats, library })
    if (page.length < BATCH) break
  }
  return stats
}
