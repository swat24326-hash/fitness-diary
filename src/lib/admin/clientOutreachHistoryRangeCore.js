/**
 * Диапазон истории связи клиента: один день МСК или «всё время» (до max lookback).
 */

import { CLUB_CALL_LOG_MAX_LOOKBACK_DAYS } from './clubCallLogCore.js'
import { CLUB_SMS_LOG_MAX_LOOKBACK_DAYS } from './clubSmsLogCore.js'

export const CLIENT_OUTREACH_RANGE_DAY = 'day'
export const CLIENT_OUTREACH_RANGE_ALL = 'all'

export const CLIENT_OUTREACH_HISTORY_TABS = [
  { id: 'calls', label: 'Звонки' },
  { id: 'sms', label: 'SMS' },
]

/**
 * @param {unknown} raw
 * @returns {'day' | 'all'}
 */
export function normalizeClientOutreachRangeMode(raw) {
  return String(raw ?? '').trim().toLowerCase() === CLIENT_OUTREACH_RANGE_ALL
    ? CLIENT_OUTREACH_RANGE_ALL
    : CLIENT_OUTREACH_RANGE_DAY
}

/**
 * @param {unknown} raw
 * @returns {'calls' | 'sms'}
 */
export function normalizeClientOutreachHistoryTab(raw) {
  return String(raw ?? '').trim().toLowerCase() === 'sms' ? 'sms' : 'calls'
}

/**
 * Параметры загрузки журнала звонков / SMS для истории клиента.
 * @param {{
 *   rangeMode?: unknown,
 *   day?: string | null,
 *   kind?: 'calls' | 'sms',
 *   todayIso?: string,
 * }} p
 * @returns {{ day?: string, sinceDays?: number, summaryScope: 'day' | 'all', lookbackDays: number }}
 */
export function resolveClientOutreachHistoryFetchOpts(p = {}) {
  const mode = normalizeClientOutreachRangeMode(p.rangeMode)
  const kind = p.kind === 'sms' ? 'sms' : 'calls'
  const lookbackDays =
    kind === 'sms' ? CLUB_SMS_LOG_MAX_LOOKBACK_DAYS : CLUB_CALL_LOG_MAX_LOOKBACK_DAYS
  if (mode === CLIENT_OUTREACH_RANGE_ALL) {
    return { sinceDays: lookbackDays, summaryScope: 'all', lookbackDays }
  }
  let day = String(p.day ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    day = String(p.todayIso ?? '').trim().slice(0, 10)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    /* без валидного дня не уходим в «14 дней без фильтра» — пустой day = ошибка вызывающего */
    return { summaryScope: 'day', lookbackDays }
  }
  return { day, summaryScope: 'day', lookbackDays }
}

/**
 * @param {'day' | 'all'} scope
 * @param {number} [lookbackDays]
 */
export function clientOutreachHistorySummaryPrefix(scope, lookbackDays = 90) {
  if (scope === 'all') return `За ${Math.max(1, Math.floor(lookbackDays))} дн.`
  return 'За день'
}

/**
 * Фильтр строк SMS по клиенту (если API ещё без client_id).
 * @param {object[]|null|undefined} rows
 * @param {string} clientId
 */
export function filterClubSmsLogsByClientId(rows, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return []
  const list = Array.isArray(rows) ? rows : []
  return list.filter((r) => String(r?.client_id ?? '').trim() === id)
}
