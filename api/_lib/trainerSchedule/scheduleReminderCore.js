/**
 * Напоминание тренеру о записи Ежедневника за 15 минут (без БД и сети): окно, текст, план, настройка устройства.
 */
import { normalizePushUnsubscribePayload } from '../../../src/lib/push/trainerPushCore.js'
import { buildScheduleEntryLabel } from '../../../src/lib/trainer/trainerScheduleCore.js'
import { resolveScheduleEntryKind, scheduleKindLabel } from '../../../src/lib/trainer/trainerScheduleKindCore.js'
import { formatSlotTime } from '../clientPortal/clientReminderCore.js'

export const SCHEDULE_REMINDER_LEAD_MIN = 15
export const SCHEDULE_REMINDER_URL = '/trainer/calendar'

/** Запись начнётся в ближайшие 15 минут (начавшиеся и прошедшие — нет). */
export function isScheduleReminderDue(startMinutes, nowMinutes) {
  const left = Number(startMinutes) - Number(nowMinutes)
  return left > 0 && left <= SCHEDULE_REMINDER_LEAD_MIN
}

export function scheduleReminderKey(entryId, dayDate, startMinutes) {
  return `${entryId}|${dayDate}|${Number(startMinutes)}`
}

/**
 * @param {{ entry: object, nowMinutes: number, clientNameById?: Record<string, string> }} p
 */
export function buildScheduleReminderPayload({ entry, nowMinutes, clientNameById = {} }) {
  const start = Number(entry.start_minutes)
  const left = Math.max(1, start - Number(nowMinutes))
  const kind = scheduleKindLabel(resolveScheduleEntryKind(entry))
  return {
    title: `Через ${left} мин · ${formatSlotTime(start)}`,
    body: `${kind}: ${buildScheduleEntryLabel(entry, clientNameById)}`,
    url: SCHEDULE_REMINDER_URL,
    tag: `schedule-reminder-${entry.id}`,
  }
}

/**
 * Кому и что отправить сейчас. Запись, уже ставшая тренировкой, не напоминает;
 * устройство с выключенным тумблером пропускаем.
 * @param {{
 *   today: string,
 *   nowMinutes: number,
 *   entries: object[],
 *   subscriptions: object[],
 *   sentKeys: Set<string>,
 *   clientNameById?: Record<string, string>,
 * }} p
 */
export function planScheduleReminders({ today, nowMinutes, entries, subscriptions, sentKeys, clientNameById = {} }) {
  const subsByUser = new Map()
  for (const s of subscriptions) {
    if (s.schedule_reminders === false) continue
    const uid = String(s.user_id)
    if (!subsByUser.has(uid)) subsByUser.set(uid, [])
    subsByUser.get(uid).push(s)
  }
  const plan = []
  for (const entry of entries) {
    if (String(entry.day_date) !== today || entry.linked_training_id) continue
    if (!isScheduleReminderDue(entry.start_minutes, nowMinutes)) continue
    const rows = subsByUser.get(String(entry.trainer_id))
    if (!rows?.length) continue
    if (sentKeys.has(scheduleReminderKey(entry.id, today, entry.start_minutes))) continue
    plan.push({
      entryId: String(entry.id),
      dayDate: today,
      startMinutes: Number(entry.start_minutes),
      rows,
      payload: buildScheduleReminderPayload({ entry, nowMinutes, clientNameById }),
    })
  }
  return plan
}

/**
 * Запрос настройки устройства: endpoint обязателен, schedule_reminders — только boolean (иначе это чтение).
 * @param {unknown} body
 */
export function normalizeSchedulePrefsPayload(body) {
  const base = normalizePushUnsubscribePayload(body)
  if (!base.ok) return base
  const raw = /** @type {any} */ (body)?.schedule_reminders
  return { ok: true, endpoint: base.endpoint, scheduleReminders: typeof raw === 'boolean' ? raw : null }
}
