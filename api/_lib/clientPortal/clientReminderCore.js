/**
 * Напоминание клиенту о завтрашней тренировке (без БД и сети): окно отправки, тихие часы, текст, план.
 * Текст — только время и тренер: его видно на заблокированном экране.
 */
import { CLUB_OPS_TIMEZONE } from '../../../src/lib/dateRu.js'

export const CLIENT_REMINDER_FROM_MIN = 19 * 60
export const CLIENT_QUIET_FROM_MIN = 22 * 60
export const CLIENT_QUIET_TO_MIN = 9 * 60

/** Минуты от полуночи по часам клуба. */
export function clubOpsMinutesNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLUB_OPS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value)
  const m = Number(parts.find((p) => p.type === 'minute')?.value)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0
}

export function isClientQuietMinute(minutes) {
  return minutes >= CLIENT_QUIET_FROM_MIN || minutes < CLIENT_QUIET_TO_MIN
}

/** 19:00–22:00: cron опоздал — догоняем до тихих часов, позже уже не шлём. */
export function isClientReminderWindow(minutes) {
  return minutes >= CLIENT_REMINDER_FROM_MIN && !isClientQuietMinute(minutes)
}

export function formatSlotTime(startMinutes) {
  const m = Number(startMinutes) || 0
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

const SIBILANT = /[жшчщц]$/i
const FEMALE_SOFT = new Set(['любовь', 'нинель', 'ассоль'])

/**
 * «с Анной», «с Сергеем». Только русские имена с понятным окончанием; иначе null —
 * тогда текст без склонения («тренер Ким»), чтобы не исказить имя.
 */
export function trainerNameInstrumental(fullName) {
  const name = String(fullName ?? '').trim().split(/\s+/)[0] ?? ''
  if (!/^[А-ЯЁ][а-яё]+$/.test(name)) return null
  const lower = name.toLowerCase()
  const stem = name.slice(0, -1)
  if (lower === 'илья') return 'Ильёй'
  if (FEMALE_SOFT.has(lower)) return `${name}ю`
  if (lower.endsWith('а')) return SIBILANT.test(stem) ? `${stem}ей` : `${stem}ой`
  if (lower.endsWith('я') || lower.endsWith('й') || lower.endsWith('ь')) return `${stem}${lower.endsWith('я') ? 'ей' : 'ем'}`
  if (/[бвгдзклмнпрстфх]$/.test(lower)) return `${name}ом`
  return null
}

export function buildClientReminderBody({ startMinutes, trainerName }) {
  const head = `Завтра в ${formatSlotTime(startMinutes)} — тренировка`
  const first = String(trainerName ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first) return head
  const inst = trainerNameInstrumental(first)
  return inst ? `${head} с ${inst}` : `${head}, тренер ${first}`
}

export function clientReminderKey(clientId, dayDate, startMinutes) {
  return `${clientId}|${String(dayDate).slice(0, 10)}|${Number(startMinutes)}`
}

function clientIdsOf(entry) {
  const raw = Array.isArray(entry?.client_ids) ? entry.client_ids : []
  return raw.map((id) => String(id ?? '').trim()).filter(Boolean)
}

/**
 * Кому и что отправить. subscriptions — уже живые (сессия не отозвана, клиент не в архиве).
 * @param {{
 *   tomorrow: string,
 *   entries: Array<{ day_date: string, start_minutes: number, trainer_id: string, client_ids: unknown[] }>,
 *   subscriptions: Array<{ id: string, client_id: string, endpoint: string, p256dh: string, auth: string }>,
 *   sentKeys: Set<string>,
 *   trainerNames: Map<string, string>,
 *   clubTitles: Map<string, string>,
 * }} input clubTitles — client_id → название клуба (заголовок уведомления)
 */
export function planClientReminders({ tomorrow, entries, subscriptions, sentKeys, trainerNames, clubTitles }) {
  const subsByClient = new Map()
  for (const s of subscriptions) {
    const id = String(s.client_id)
    if (!subsByClient.has(id)) subsByClient.set(id, [])
    subsByClient.get(id).push(s)
  }
  const seen = new Set(sentKeys)
  const plan = []
  const sorted = [...entries].sort((a, b) => Number(a.start_minutes) - Number(b.start_minutes))
  for (const entry of sorted) {
    if (String(entry.day_date).slice(0, 10) !== tomorrow) continue
    for (const clientId of clientIdsOf(entry)) {
      const rows = subsByClient.get(clientId)
      const key = clientReminderKey(clientId, tomorrow, entry.start_minutes)
      if (!rows || seen.has(key)) continue
      seen.add(key)
      plan.push({
        clientId,
        dayDate: tomorrow,
        startMinutes: Number(entry.start_minutes),
        rows,
        payload: {
          title: clubTitles.get(clientId) || 'Напоминание о тренировке',
          body: buildClientReminderBody({
            startMinutes: entry.start_minutes,
            trainerName: trainerNames.get(String(entry.trainer_id)),
          }),
          url: '/me',
          tag: `client-reminder-${tomorrow}-${Number(entry.start_minutes)}`,
        },
      })
    }
  }
  return plan
}
