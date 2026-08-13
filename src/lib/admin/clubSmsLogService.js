/**
 * Журнал клубных SMS: облако (источник истины) + локальный кэш outreach_log.
 */
import { getDb, putStore } from '../localDb.js'
import { todayLocalIso } from '../dateRu.js'
import {
  CLUB_SMS_LOG_DEFAULT_LOOKBACK_DAYS,
  clampClubSmsLogSinceDays,
} from './clubSmsLogCore.js'
import { calendarDaysBetween } from './clubSmsSentMarkCore.js'
import { fetchClubSmsLogs } from './clubSmsService.js'
import { mapClubSmsMarksByClient } from './clubSmsSentMarkCore.js'

/**
 * @param {{
 *   id?: string,
 *   client_id: string,
 *   club_id: string,
 *   user_id?: string | null,
 *   scenario?: string | null,
 *   message_preview?: string,
 *   status?: string | null,
 *   error_message?: string | null,
 *   created_at?: string,
 * }} row
 */
export async function appendClubSmsLog(row) {
  const id =
    row.id ??
    (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `csms_${Date.now()}`)
  const status = String(row.status ?? 'ok').toLowerCase() === 'fail' ? 'fail' : 'ok'
  const entry = {
    id,
    client_id: String(row.client_id),
    club_id: String(row.club_id),
    trainer_id: row.user_id ? String(row.user_id) : 'club',
    scenario: String(row.scenario ?? 'custom'),
    channel: 'club_sms',
    message_preview: String(row.message_preview ?? '').slice(0, 120),
    status,
    error_message: status === 'fail' ? String(row.error_message ?? '').slice(0, 200) : '',
    created_at: row.created_at ?? new Date().toISOString(),
  }
  await putStore('outreach_log', entry)
  return entry
}

/** @param {object} cloudRow */
async function cacheCloudRowLocally(cloudRow) {
  const id = String(cloudRow?.id ?? '').trim()
  const client_id = String(cloudRow?.client_id ?? '').trim()
  const club_id = String(cloudRow?.club_id ?? '').trim()
  if (!id || !client_id || !club_id) return
  const status = String(cloudRow.status ?? 'ok').toLowerCase() === 'fail' ? 'fail' : 'ok'
  await putStore('outreach_log', {
    id,
    client_id,
    club_id,
    trainer_id: cloudRow.sent_by ? String(cloudRow.sent_by) : 'club',
    scenario: String(cloudRow.scenario ?? 'custom'),
    channel: 'club_sms',
    message_preview: String(cloudRow.message_preview ?? '').slice(0, 120),
    status,
    error_message: status === 'fail' ? String(cloudRow.error_message ?? '').slice(0, 200) : '',
    created_at: String(cloudRow.created_at ?? new Date().toISOString()),
  })
}

/**
 * Локальный fallback (IDB), если облако недоступно.
 * @param {string} clubId
 * @param {{ todayIso?: string, lookbackDays?: number }} [opts]
 */
export async function listLocalClubSmsLogs(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  const day = String(opts.todayIso ?? todayLocalIso()).slice(0, 10)
  const lookback = clampClubSmsLogSinceDays(opts.lookbackDays ?? CLUB_SMS_LOG_DEFAULT_LOOKBACK_DAYS)
  /** @type {object[]} */
  const out = []
  if (!cid || !day) return out
  const db = await getDb()
  if (!db.objectStoreNames.contains('outreach_log')) return out
  const rows = await db.getAll('outreach_log')
  for (const r of rows ?? []) {
    if (String(r?.channel ?? '') !== 'club_sms') continue
    if (String(r?.club_id ?? '') !== cid) continue
    const atDay = String(r?.created_at ?? '').slice(0, 10)
    if (!atDay) continue
    const age = calendarDaysBetween(atDay, day)
    if (age < 0 || age >= lookback) continue
    out.push(r)
  }
  return out
}

/**
 * Сначала облако, при ошибке — локальный кэш. Успешные облачные строки кэшируем в IDB.
 * @param {string} clubId
 * @param {{ todayIso?: string, lookbackDays?: number }} [opts]
 */
export async function listRecentClubSmsLogs(clubId, opts = {}) {
  const lookback = clampClubSmsLogSinceDays(opts.lookbackDays ?? CLUB_SMS_LOG_DEFAULT_LOOKBACK_DAYS)
  try {
    const cloud = await fetchClubSmsLogs(clubId, { sinceDays: lookback })
    for (const row of cloud) {
      try {
        await cacheCloudRowLocally(row)
      } catch {
        /* кэш необязателен */
      }
    }
    return cloud
  } catch {
    return listLocalClubSmsLogs(clubId, {
      todayIso: opts.todayIso,
      lookbackDays: lookback,
    })
  }
}

/**
 * @param {string} clubId
 * @param {{
 *   todayIso?: string,
 *   viewingFilter?: string,
 *   clientScenarioById?: Record<string, string> | Map<string, string>,
 * }} [opts]
 */
export async function mapClubSmsMarksForFilter(clubId, opts = {}) {
  const today = String(opts.todayIso ?? todayLocalIso()).slice(0, 10)
  const viewingFilter = String(opts.viewingFilter ?? 'all')
  const logs = await listRecentClubSmsLogs(clubId, { todayIso: today })
  return mapClubSmsMarksByClient(logs, {
    today,
    viewingFilter,
    clientScenarioById: opts.clientScenarioById,
  })
}

/**
 * @param {string} clubId
 * @param {string} [todayIso]
 */
export async function mapClubSmsSentTodayByClient(clubId, todayIso = todayLocalIso()) {
  return mapClubSmsMarksForFilter(clubId, { todayIso, viewingFilter: 'all' })
}

/** @param {string} clientId @param {string} clubId @param {string} [todayIso] */
export async function hasClubSmsSentToday(clientId, clubId, todayIso = todayLocalIso()) {
  const map = await mapClubSmsSentTodayByClient(clubId, todayIso)
  return map.has(String(clientId ?? '').trim())
}

export { mapClubSmsMarksByClient }
