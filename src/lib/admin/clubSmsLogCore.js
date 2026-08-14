/**
 * Чистые правила облачного журнала клубных SMS (без React / IDB).
 */

import { calendarDayStartUtcIso, CLUB_OPS_TIMEZONE } from '../dateRu.js'

export const CLUB_SMS_LOG_PREVIEW_MAX = 160
export const CLUB_SMS_LOG_ERROR_MAX = 200
export const CLUB_SMS_LOG_DEFAULT_LOOKBACK_DAYS = 14
export const CLUB_SMS_LOG_MAX_LOOKBACK_DAYS = 90
export const CLUB_SMS_LOG_MAX_ROWS = 200

export const CLUB_SMS_LOG_SCENARIOS = [
  'birthdays',
  'expiring',
  'expired_recent',
  'stale',
  'custom',
]

export const CLUB_SMS_LOG_STATUSES = ['ok', 'fail']

/** @param {string | null | undefined} scenario */
export function normalizeClubSmsLogScenario(scenario) {
  const s = String(scenario ?? '').trim().toLowerCase()
  if (CLUB_SMS_LOG_SCENARIOS.includes(s)) return s
  return 'custom'
}

/** @param {unknown} raw */
export function normalizeClubSmsLogStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  return s === 'fail' ? 'fail' : 'ok'
}

/** @param {string | null | undefined} text */
export function truncateClubSmsPreview(text) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  if (t.length <= CLUB_SMS_LOG_PREVIEW_MAX) return t
  return `${t.slice(0, CLUB_SMS_LOG_PREVIEW_MAX - 1)}…`
}

/** @param {string | null | undefined} text */
export function truncateClubSmsError(text) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  if (t.length <= CLUB_SMS_LOG_ERROR_MAX) return t
  return `${t.slice(0, CLUB_SMS_LOG_ERROR_MAX - 1)}…`
}

/**
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function clampClubSmsLogSinceDays(raw, fallback = CLUB_SMS_LOG_DEFAULT_LOOKBACK_DAYS) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(CLUB_SMS_LOG_MAX_LOOKBACK_DAYS, Math.max(1, Math.floor(n)))
}

/**
 * @param {{
 *   club_id: string,
 *   client_id: string,
 *   sent_by?: string | null,
 *   scenario?: string | null,
 *   message_preview?: string | null,
 *   status?: string | null,
 *   error_message?: string | null,
 *   id?: string,
 *   created_at?: string,
 * }} input
 */
export function buildClubSmsLogInsertRow(input) {
  const club_id = String(input.club_id ?? '').trim()
  const client_id = String(input.client_id ?? '').trim()
  if (!club_id || !client_id) {
    return { ok: false, error: 'club_id and client_id required' }
  }
  const status = normalizeClubSmsLogStatus(input.status)
  const row = {
    club_id,
    client_id,
    sent_by: input.sent_by ? String(input.sent_by) : null,
    scenario: normalizeClubSmsLogScenario(input.scenario),
    message_preview: truncateClubSmsPreview(input.message_preview),
    status,
    error_message: status === 'fail' ? truncateClubSmsError(input.error_message) || null : null,
  }
  if (input.id) row.id = String(input.id)
  if (input.created_at) row.created_at = String(input.created_at)
  return { ok: true, row }
}

/**
 * Строка для UI / отметок (единый shape с локальным журналом).
 * @param {object} row
 * @param {{ clientName?: string, sentByName?: string }} [extra]
 */
export function shapeClubSmsLogApiRow(row, extra = {}) {
  if (!row) return null
  const status = normalizeClubSmsLogStatus(row.status)
  return {
    id: String(row.id ?? ''),
    club_id: String(row.club_id ?? ''),
    client_id: String(row.client_id ?? ''),
    sent_by: row.sent_by ? String(row.sent_by) : null,
    scenario: normalizeClubSmsLogScenario(row.scenario),
    message_preview: String(row.message_preview ?? ''),
    status,
    error_message: status === 'fail' ? String(row.error_message ?? '') : '',
    created_at: String(row.created_at ?? ''),
    client_name: extra.clientName ? String(extra.clientName) : null,
    sent_by_name: extra.sentByName ? String(extra.sentByName) : null,
  }
}

/** Успешные касания для отметок на кнопке SMS. */
export function isClubSmsLogSuccessRow(row) {
  return normalizeClubSmsLogStatus(row?.status) === 'ok'
}

/**
 * @param {Array<{ status?: string }>} logs
 * @param {'all' | 'ok' | 'fail'} filter
 */
export function filterClubSmsLogRowsByStatus(logs, filter) {
  const f = String(filter ?? 'all')
  if (f === 'ok') return (logs ?? []).filter((r) => normalizeClubSmsLogStatus(r?.status) === 'ok')
  if (f === 'fail') return (logs ?? []).filter((r) => normalizeClubSmsLogStatus(r?.status) === 'fail')
  return Array.isArray(logs) ? [...logs] : []
}

/**
 * @param {Array<{ status?: string }>} logs
 */
export function summarizeClubSmsLogRows(logs) {
  let ok = 0
  let fail = 0
  for (const row of logs ?? []) {
    if (normalizeClubSmsLogStatus(row?.status) === 'fail') fail += 1
    else ok += 1
  }
  return { total: ok + fail, ok, fail }
}

/**
 * ISO нижней границы для since_days — календарные дни клуба (Europe/Moscow).
 * @param {string} todayIso
 * @param {number} sinceDays
 */
export function clubSmsLogSinceIso(todayIso, sinceDays) {
  const day = String(todayIso ?? '').slice(0, 10)
  const days = clampClubSmsLogSinceDays(sinceDays)
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return calendarDayStartUtcIso(day, CLUB_OPS_TIMEZONE)
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  dt.setUTCDate(dt.getUTCDate() - (days - 1))
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return calendarDayStartUtcIso(`${y}-${mo}-${d}`, CLUB_OPS_TIMEZONE)
}
