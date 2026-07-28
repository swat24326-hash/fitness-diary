/**
 * ЗП на планшете: приоритет
 * 1) /api/admin-data?action=trainer-self-stats (сервер, стабильно)
 * 2) last-good localStorage
 * 3) локальный кэш + прямой Supabase (фолбэк)
 */

import { isSupabaseConfigured, supabase } from '../supabase'
import { isAppOnline } from '../syncService'
import { withSupabaseRetry, isRetryableNetworkError } from '../supabaseRetry'
import { loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import {
  fetchTrainerTrainingsRemoteInRange,
  TRAINER_REMOTE_RETRY,
} from './trainerPeriodStatsService.js'
import { mergeLocalAndRemoteTrainings, mergeRowsById } from './trainerRemoteMerge.js'
import { computeTrainerSelfPayroll } from './trainerSelfPayroll.js'
import { fetchTrainerSelfStatsViaApi } from './trainerSelfStatsApi.js'
import {
  readTrainerSelfStatsLastGood,
  writeTrainerSelfStatsLastGood,
} from './trainerSelfStatsLastGood.js'

export { mergeRowsById } from './trainerRemoteMerge.js'
export { payrollFallbackLabel } from './trainerSelfPayroll.js'

const MEM_PAGE = 500
const MEM_MAX = 8000

/**
 * @param {string} clubId
 * @returns {Promise<{ rows: object[], partial: boolean, warn: string | null }>}
 */
export async function fetchTrainerMembershipsRemote(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured() || !supabase) {
    return { rows: [], partial: false, warn: null }
  }

  const out = []
  let fromIdx = 0
  while (out.length < MEM_MAX) {
    const toIdx = fromIdx + MEM_PAGE - 1
    try {
      const { data, error } = await withSupabaseRetry(
        () =>
          supabase
            .from('memberships')
            .select(
              'id, client_id, club_id, start_date, end_date, total_trainings, used_trainings, membership_type_id',
            )
            .eq('club_id', cid)
            .order('id', { ascending: true })
            .range(fromIdx, toIdx),
        TRAINER_REMOTE_RETRY,
      )
      if (error) throw error
      const chunk = Array.isArray(data) ? data : []
      out.push(...chunk)
      if (chunk.length < MEM_PAGE) break
      fromIdx += MEM_PAGE
    } catch (e) {
      if (out.length > 0 && isRetryableNetworkError(e)) {
        return {
          rows: out.slice(0, MEM_MAX),
          partial: true,
          warn: e?.message ? String(e.message).slice(0, 80) : 'partial',
        }
      }
      throw e
    }
  }
  return { rows: out.slice(0, MEM_MAX), partial: false, warn: null }
}

/**
 * @param {{
 *   trainerId: string,
 *   clubId: string | null,
 *   dayIso: string,
 *   monthFrom: string,
 *   monthTo: string,
 *   membershipTypes: object[],
 *   membershipsLocal?: object[],
 * }} p
 * @returns {Promise<{
 *   dayPay: number,
 *   monthPay: number,
 *   source: string,
 *   fallbackReason: string | null,
 *   period?: object | null,
 * }>}
 */
export async function loadTrainerSelfPayrollAmounts(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const dayIso = String(p.dayIso ?? '').slice(0, 10)
  const monthFrom = String(p.monthFrom ?? '').slice(0, 10)
  const monthTo = String(p.monthTo ?? '').slice(0, 10)
  const empty = { dayPay: 0, monthPay: 0, source: 'local', fallbackReason: null, period: null }

  if (!trainerId || !clubId || !dayIso || !monthFrom || !monthTo) return empty

  const lastGood = readTrainerSelfStatsLastGood(trainerId, monthFrom, monthTo, dayIso)

  if (isAppOnline()) {
    try {
      const api = await fetchTrainerSelfStatsViaApi({
        dateFrom: monthFrom,
        dateTo: monthTo,
        dayIso,
      })
      if (api?.payroll && typeof api.payroll.dayPay === 'number') {
        writeTrainerSelfStatsLastGood(trainerId, monthFrom, monthTo, dayIso, api)
        return {
          dayPay: api.payroll.dayPay,
          monthPay: api.payroll.monthPay,
          source: 'api',
          fallbackReason: null,
          period: api.period ?? null,
        }
      }
    } catch (e) {
      console.warn('[trainer-payroll] api', e)
      if (lastGood) {
        return {
          dayPay: lastGood.payroll.dayPay,
          monthPay: lastGood.payroll.monthPay,
          source: 'last_good',
          fallbackReason: e?.message ? String(e.message).slice(0, 120) : 'api_failed',
          period: lastGood.period ?? null,
        }
      }
    }
  }

  if (lastGood) {
    // Параллельно досчитаем локально, но сначала отдадим last-good через отдельный путь в UI;
    // здесь — полный локальный путь как запас.
  }

  const loadFrom = dayIso < monthFrom ? dayIso : monthFrom
  const loadTo = dayIso > monthTo ? dayIso : monthTo

  const snap = await loadTrainerWorkspaceSnapshot(trainerId, clubId)
  let trainings = snap.trainings ?? []
  let memberships = Array.isArray(p.membershipsLocal) ? p.membershipsLocal : []
  let source = 'local'
  let fallbackReason = null

  if (isSupabaseConfigured() && isAppOnline()) {
    try {
      const remote = await fetchTrainerTrainingsRemoteInRange(trainerId, loadFrom, loadTo)
      if (remote.rows.length > 0) {
        trainings = mergeLocalAndRemoteTrainings(trainings, remote.rows, loadFrom, loadTo)
        source = remote.partial ? 'remote_partial' : 'remote'
        if (remote.partial && remote.warn) fallbackReason = `частично: ${remote.warn}`
      }
    } catch (e) {
      fallbackReason = e?.message ? String(e.message).slice(0, 120) : 'remote_failed'
      console.warn('[trainer-payroll] remote trainings', e)
    }

    try {
      const remoteMem = await fetchTrainerMembershipsRemote(clubId)
      if (remoteMem.rows.length > 0) {
        memberships = mergeRowsById(memberships, remoteMem.rows)
        if (source === 'local') source = remoteMem.partial ? 'remote_partial' : 'remote'
        if (remoteMem.partial && remoteMem.warn && !fallbackReason) {
          fallbackReason = `частично: ${remoteMem.warn}`
        }
      }
    } catch (memErr) {
      console.warn('[trainer-payroll] remote memberships', memErr)
      if (!fallbackReason) {
        fallbackReason = memErr?.message
          ? String(memErr.message).slice(0, 120)
          : 'memberships_remote_failed'
      }
    }
  }

  const types = p.membershipTypes ?? []
  const ctx = { trainings, memberships, membershipTypes: types, trainerId }
  const dayPay = computeTrainerSelfPayroll({ ...ctx, dateFrom: dayIso, dateTo: dayIso })
  const monthPay = computeTrainerSelfPayroll({ ...ctx, dateFrom: monthFrom, dateTo: monthTo })

  if (dayPay > 0 || monthPay > 0) {
    writeTrainerSelfStatsLastGood(trainerId, monthFrom, monthTo, dayIso, {
      payroll: { dayPay, monthPay },
      source,
    })
  } else if (lastGood && (fallbackReason || source === 'local')) {
    return {
      dayPay: lastGood.payroll.dayPay,
      monthPay: lastGood.payroll.monthPay,
      source: 'last_good',
      fallbackReason: fallbackReason || 'local_empty',
      period: lastGood.period ?? null,
    }
  }

  return { dayPay, monthPay, source, fallbackReason, period: null }
}
