/**
 * Чистые правила облачного журнала клубных звонков (Мои Звонки).
 */

import { calendarDayStartUtcIso, CLUB_OPS_TIMEZONE } from '../dateRu.js'
import { normalizeClubCallRecordingUrl } from './clubCallOutcomeCore.js'

export const CLUB_CALL_LOG_ERROR_MAX = 200
export const CLUB_CALL_LOG_PHONE_MAX = 20
export const CLUB_CALL_LOG_STAFF_NOTE_MAX = 400
export const CLUB_CALL_LOG_DEFAULT_LOOKBACK_DAYS = 14
export const CLUB_CALL_LOG_MAX_LOOKBACK_DAYS = 90
export const CLUB_CALL_LOG_MAX_ROWS = 200

export const CLUB_CALL_LOG_STATUSES = ['ok', 'fail']

/**
 * Нормализация пометки сотрудника к звонку.
 * Пустая строка → null (сброс).
 * @param {unknown} raw
 * @returns {{ ok: true, note: string | null } | { ok: false, error: string }}
 */
export function normalizeClubCallStaffNote(raw) {
  const t = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!t) return { ok: true, note: null }
  if (t.length > CLUB_CALL_LOG_STAFF_NOTE_MAX) {
    return {
      ok: false,
      error: `Пометка слишком длинная (макс. ${CLUB_CALL_LOG_STAFF_NOTE_MAX} символов)`,
    }
  }
  return { ok: true, note: t }
}

/**
 * Патч строки журнала: staff_note + кто/когда.
 * @param {{
 *   club_id: string,
 *   log_id: string,
 *   staff_note?: unknown,
 *   staff_note_by?: string | null,
 *   staff_note_at?: string,
 * }} input
 */
export function buildClubCallStaffNotePatch(input) {
  const club_id = String(input.club_id ?? '').trim()
  const log_id = String(input.log_id ?? '').trim()
  if (!club_id || !log_id) {
    return { ok: false, error: 'Нужны club_id и log_id' }
  }
  const norm = normalizeClubCallStaffNote(input.staff_note)
  if (!norm.ok) return { ok: false, error: norm.error }
  const at =
    String(input.staff_note_at ?? '').trim() ||
    (norm.note ? new Date().toISOString() : null)
  return {
    ok: true,
    club_id,
    log_id,
    patch: {
      staff_note: norm.note,
      staff_note_at: norm.note ? at : null,
      staff_note_by: norm.note && input.staff_note_by ? String(input.staff_note_by) : null,
    },
  }
}

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
  const outcome = String(row.outcome ?? 'pending').trim().toLowerCase() || 'pending'
  const durationRaw = row.duration_sec
  const duration_sec =
    durationRaw == null || durationRaw === ''
      ? null
      : Math.max(0, Math.floor(Number(durationRaw) || 0))
  return {
    id: String(row.id ?? ''),
    club_id: String(row.club_id ?? ''),
    client_id: String(row.client_id ?? ''),
    sent_by: row.sent_by ? String(row.sent_by) : null,
    phone: String(row.phone ?? ''),
    status,
    error_message: status === 'fail' ? String(row.error_message ?? '') : '',
    created_at: String(row.created_at ?? ''),
    outcome: ['answered', 'missed', 'short', 'unknown'].includes(outcome) ? outcome : 'pending',
    answered: row.answered == null ? null : Boolean(row.answered),
    duration_sec,
    mz_db_call_id: row.mz_db_call_id ? String(row.mz_db_call_id) : null,
    src_number: row.src_number ? String(row.src_number) : null,
    finished_at: row.finished_at ? String(row.finished_at) : null,
    recording_url: normalizeClubCallRecordingUrl(row.recording_url),
    staff_note: row.staff_note != null && String(row.staff_note).trim() ? String(row.staff_note).trim() : null,
    staff_note_at: row.staff_note_at ? String(row.staff_note_at) : null,
    staff_note_by: row.staff_note_by ? String(row.staff_note_by) : null,
    client_name: extra.clientName ? String(extra.clientName) : null,
    sent_by_name: extra.sentByName ? String(extra.sentByName) : null,
  }
}

/** @param {Array<{ status?: string, outcome?: string }>} logs @param {string} filter */
export function filterClubCallLogRowsByStatus(logs, filter) {
  const f = String(filter ?? 'all').trim().toLowerCase()
  const list = Array.isArray(logs) ? logs : []
  if (f === 'ok') return list.filter((r) => normalizeClubCallLogStatus(r?.status) === 'ok')
  if (f === 'fail') return list.filter((r) => normalizeClubCallLogStatus(r?.status) === 'fail')
  if (f === 'answered' || f === 'missed' || f === 'short' || f === 'pending') {
    return list.filter((r) => String(r?.outcome ?? 'pending').trim().toLowerCase() === f)
  }
  return [...list]
}

/** Длительность для UI: «1:05» или пусто. @param {unknown} sec */
export function formatClubCallDurationSec(sec) {
  if (sec == null || sec === '') return ''
  const n = Math.max(0, Math.floor(Number(sec) || 0))
  if (!Number.isFinite(n) || n <= 0) return ''
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** @param {Array<{ status?: string, outcome?: string }>} logs */
export function summarizeClubCallLogRows(logs) {
  let ok = 0
  let fail = 0
  let answered = 0
  let missed = 0
  let short = 0
  let pending = 0
  for (const row of logs ?? []) {
    if (normalizeClubCallLogStatus(row?.status) === 'fail') {
      fail += 1
      continue
    }
    ok += 1
    const outcome = String(row?.outcome ?? 'pending').toLowerCase()
    if (outcome === 'answered') answered += 1
    else if (outcome === 'missed') missed += 1
    else if (outcome === 'short') short += 1
    else pending += 1
  }
  return { total: ok + fail, ok, fail, answered, missed, short, pending }
}

/**
 * Нижняя граница журнала: календарные дни клуба (Europe/Moscow), не UTC-полночь сервера.
 * @param {string} todayIso
 * @param {number} sinceDays
 */
export function clubCallLogSinceIso(todayIso, sinceDays) {
  const day = String(todayIso ?? '').slice(0, 10)
  const days = clampClubCallLogSinceDays(sinceDays)
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return calendarDayStartUtcIso(day, CLUB_OPS_TIMEZONE)
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  dt.setUTCDate(dt.getUTCDate() - (days - 1))
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return calendarDayStartUtcIso(`${y}-${mo}-${d}`, CLUB_OPS_TIMEZONE)
}
