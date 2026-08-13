/**
 * Чистые правила облачного журнала клубных звонков (Мои Звонки).
 */

export const CLUB_CALL_LOG_ERROR_MAX = 200
export const CLUB_CALL_LOG_PHONE_MAX = 20
export const CLUB_CALL_LOG_DEFAULT_LOOKBACK_DAYS = 14
export const CLUB_CALL_LOG_MAX_LOOKBACK_DAYS = 90
export const CLUB_CALL_LOG_MAX_ROWS = 200

export const CLUB_CALL_LOG_STATUSES = ['ok', 'fail']

/** @param {unknown} raw */
export function normalizeClubCallLogStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  return s === 'fail' ? 'fail' : 'ok'
}

/** @param {string | null | undefined} text */
export function truncateClubCallError(text) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  if (t.length <= CLUB_CALL_LOG_ERROR_MAX) return t
  return `${t.slice(0, CLUB_CALL_LOG_ERROR_MAX - 1)}…`
}

/** @param {string | null | undefined} phone */
export function truncateClubCallPhone(phone) {
  const t = String(phone ?? '').replace(/\D/g, '')
  if (!t) return ''
  return t.slice(0, CLUB_CALL_LOG_PHONE_MAX)
}

/**
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function clampClubCallLogSinceDays(raw, fallback = CLUB_CALL_LOG_DEFAULT_LOOKBACK_DAYS) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(CLUB_CALL_LOG_MAX_LOOKBACK_DAYS, Math.max(1, Math.floor(n)))
}

/**
 * @param {{
 *   club_id: string,
 *   client_id: string,
 *   sent_by?: string | null,
 *   phone?: string | null,
 *   status?: string | null,
 *   error_message?: string | null,
 *   id?: string,
 *   created_at?: string,
 * }} input
 */
export function buildClubCallLogInsertRow(input) {
  const club_id = String(input.club_id ?? '').trim()
  const client_id = String(input.client_id ?? '').trim()
  if (!club_id || !client_id) {
    return { ok: false, error: 'club_id and client_id required' }
  }
  const status = normalizeClubCallLogStatus(input.status)
  const row = {
    club_id,
    client_id,
    sent_by: input.sent_by ? String(input.sent_by) : null,
    phone: truncateClubCallPhone(input.phone) || null,
    status,
    error_message: status === 'fail' ? truncateClubCallError(input.error_message) || null : null,
  }
  if (input.id) row.id = String(input.id)
  if (input.created_at) row.created_at = String(input.created_at)
  return { ok: true, row }
}

/**
 * @param {object} row
 * @param {{ clientName?: string, sentByName?: string }} [extra]
 */
export function shapeClubCallLogApiRow(row, extra = {}) {
  if (!row) return null
  const status = normalizeClubCallLogStatus(row.status)
  return {
    id: String(row.id ?? ''),
    club_id: String(row.club_id ?? ''),
    client_id: String(row.client_id ?? ''),
    sent_by: row.sent_by ? String(row.sent_by) : null,
    phone: String(row.phone ?? ''),
    status,
    error_message: status === 'fail' ? String(row.error_message ?? '') : '',
    created_at: String(row.created_at ?? ''),
    client_name: extra.clientName ? String(extra.clientName) : null,
    sent_by_name: extra.sentByName ? String(extra.sentByName) : null,
  }
}

/** @param {Array<{ status?: string }>} logs @param {'all' | 'ok' | 'fail'} filter */
export function filterClubCallLogRowsByStatus(logs, filter) {
  const f = String(filter ?? 'all')
  if (f === 'ok') return (logs ?? []).filter((r) => normalizeClubCallLogStatus(r?.status) === 'ok')
  if (f === 'fail') return (logs ?? []).filter((r) => normalizeClubCallLogStatus(r?.status) === 'fail')
  return Array.isArray(logs) ? [...logs] : []
}

/** @param {Array<{ status?: string }>} logs */
export function summarizeClubCallLogRows(logs) {
  let ok = 0
  let fail = 0
  for (const row of logs ?? []) {
    if (normalizeClubCallLogStatus(row?.status) === 'fail') fail += 1
    else ok += 1
  }
  return { total: ok + fail, ok, fail }
}

/**
 * @param {string} todayIso
 * @param {number} sinceDays
 */
export function clubCallLogSinceIso(todayIso, sinceDays) {
  const day = String(todayIso ?? '').slice(0, 10)
  const days = clampClubCallLogSinceDays(sinceDays)
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return `${day}T00:00:00.000Z`
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  dt.setUTCDate(dt.getUTCDate() - (days - 1))
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${d}T00:00:00.000Z`
}
