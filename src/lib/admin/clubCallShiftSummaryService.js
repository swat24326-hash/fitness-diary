/**
 * Загрузка сводки смены call-центра за день клуба (МСК).
 */
import { todayInTimeZoneIso } from '../dateRu.js'
import { fetchClubCallLogs } from './clubCallService.js'
import { fetchClubSmsLogs } from './clubSmsService.js'
import { buildClubCallShiftSummary } from './clubCallShiftSummaryCore.js'
import { isSupabaseConfigured } from '../supabase.js'
import { isAppOnline } from '../syncService.js'

/**
 * @param {string} clubId
 * @param {{ day?: string }} [opts]
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   partial?: boolean,
 *   summary: ReturnType<typeof buildClubCallShiftSummary> | null,
 * }>}
 */
export async function loadClubCallShiftSummary(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  const day = String(opts.day ?? todayInTimeZoneIso()).slice(0, 10)
  if (!cid) {
    return { ok: false, reason: 'no_club', summary: null }
  }
  if (!isSupabaseConfigured() || !isAppOnline()) {
    // Не подставлять нули: SWR оставит last-good, если summary = null.
    return { ok: false, reason: 'offline', summary: null }
  }

  const [callRes, smsRes] = await Promise.allSettled([
    fetchClubCallLogs(cid, { day }),
    fetchClubSmsLogs(cid, { day }),
  ])

  const callOk = callRes.status === 'fulfilled'
  const smsOk = smsRes.status === 'fulfilled'
  if (!callOk && !smsOk) {
    const msg =
      (callRes.status === 'rejected' && callRes.reason?.message) ||
      (smsRes.status === 'rejected' && smsRes.reason?.message) ||
      'load_failed'
    return {
      ok: false,
      reason: String(msg).slice(0, 160),
      summary: null,
    }
  }

  const callLogs = callOk ? callRes.value : []
  const smsLogs = smsOk ? smsRes.value : []
  const partial = !(callOk && smsOk)
  const reason = partial
    ? !callOk
      ? 'Звонки недоступны — показаны только SMS'
      : 'SMS недоступны — показаны только звонки'
    : undefined

  return {
    ok: true,
    partial,
    reason,
    summary: buildClubCallShiftSummary(callLogs, smsLogs, { day }),
  }
}
