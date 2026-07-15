/**
 * Локальный журнал outreach (сообщения в Max) — только на устройстве тренера.
 */
import { getDb, putStore } from '../localDb.js'
import { todayLocalIso } from '../dateRu.js'

/**
 * @param {{
 *   id?: string,
 *   client_id: string,
 *   trainer_id: string,
 *   club_id?: string | null,
 *   scenario: string,
 *   message_preview: string,
 *   created_at?: string,
 * }} row
 */
export async function appendOutreachLog(row) {
  const id = row.id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ol_${Date.now()}`)
  const entry = {
    id,
    client_id: String(row.client_id),
    trainer_id: String(row.trainer_id),
    club_id: row.club_id ? String(row.club_id) : null,
    scenario: String(row.scenario),
    message_preview: String(row.message_preview ?? '').slice(0, 120),
    created_at: row.created_at ?? new Date().toISOString(),
  }
  await putStore('outreach_log', entry)
  return entry
}

/**
 * @param {string} clientId
 * @param {number} [limit=5]
 */
export async function listOutreachLogByClientId(clientId, limit = 5) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  const db = await getDb()
  if (!db.objectStoreNames.contains('outreach_log')) return []
  let rows = []
  try {
    rows = await db.getAllFromIndex('outreach_log', 'by_client_id', cid)
  } catch {
    rows = (await db.getAll('outreach_log')).filter((r) => String(r?.client_id) === cid)
  }
  return rows
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit)
}

/**
 * @param {string} trainerId
 * @param {string} scenario
 * @param {string} [todayIso]
 */
export async function listOutreachLogTodayByScenario(trainerId, scenario, todayIso = todayLocalIso()) {
  const tid = String(trainerId ?? '').trim()
  const day = String(todayIso).slice(0, 10)
  if (!tid || !scenario) return []
  const db = await getDb()
  if (!db.objectStoreNames.contains('outreach_log')) return []
  const rows = await db.getAll('outreach_log')
  return rows.filter(
    (r) =>
      String(r?.trainer_id) === tid &&
      String(r?.scenario) === String(scenario) &&
      String(r?.created_at ?? '').slice(0, 10) === day,
  )
}

/** @param {string} clientId @param {string} trainerId @param {string} scenario @param {string} [todayIso] */
export async function hasOutreachLogToday(clientId, trainerId, scenario, todayIso = todayLocalIso()) {
  const cid = String(clientId ?? '').trim()
  const rows = await listOutreachLogTodayByScenario(trainerId, scenario, todayIso)
  return rows.some((r) => String(r?.client_id) === cid)
}

/**
 * @param {string} clubId
 * @param {unknown} outreachTemplates
 */
export async function cacheClubOutreachTemplates(clubId, outreachTemplates) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return
  await putStore('club_iskra_settings', {
    club_id: cid,
    outreach_templates: outreachTemplates ?? null,
    cached_at: new Date().toISOString(),
  })
}

/** @param {string} clubId */
export async function loadCachedClubOutreachTemplates(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return null
  const db = await getDb()
  if (!db.objectStoreNames.contains('club_iskra_settings')) return null
  const row = await db.get('club_iskra_settings', cid)
  return row?.outreach_templates ?? null
}
