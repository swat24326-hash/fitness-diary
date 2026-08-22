/**
 * Загрузка сводки смены call-центра за день клуба (МСК).
 */
import { todayInTimeZoneIso } from '../dateRu.js'
import { fetchClubCallLogs } from './clubCallService.js'
import { fetchClubSmsLogs } from './clubSmsService.js'
import { buildClubCallShiftSummary } from './clubCallShiftSummaryCore.js'
import { isSupabaseConfigured } from '../supabase.js'
import { isAppOnline } from '../syncService.js'
import {
  HOME_GLANCE_CLOUD_MS,
  homeGlanceCloudFailMessage,
  withHomeGlanceTimeout,
} from './adminHomeGlanceTimeout.js'

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
    // Не подставлять нули в кэш: SWR оставит last-good, если summary = null.
    return { ok: false, reason: 'offline', summary: null }
  }

  const [callRes, smsRes] = await Promise.allSettled([
    withHomeGlanceTimeout(fetchClubCallLogs(cid, { day }), HOME_GLANCE_CLOUD_MS),
    withHomeGlanceTimeout(fetchClubSmsLogs(cid, { day }), HOME_GLANCE_CLOUD_MS),
  ])

  const callOk = callRes.status === 'fulfilled'
  const smsOk = smsRes.status === 'fulfilled'
  if (!callOk && !smsOk) {
    const raw =
      (callRes.status === 'rejected' && callRes.reason) ||
      (smsRes.status === 'rejected' && smsRes.reason) ||
      'load_failed'
    return {
      ok: false,
      reason: homeGlanceCloudFailMessage(raw),
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
