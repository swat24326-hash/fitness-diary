/**
 * ЗП на планшете: те же ставки, что в computeTrainerSelfPayroll,
 * но тренировки/абонементы при online — из облака (иначе разные устройства = разные цифры).
 * На слабом Wi‑Fi планшета — длинный timeout, частичный ответ, кэш сессии.
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

export { mergeRowsById } from './trainerRemoteMerge.js'
export { payrollFallbackLabel } from './trainerSelfPayroll.js'

const MEM_PAGE = 500
const MEM_MAX = 8000
const SESSION_CACHE_TTL_MS = 8 * 60 * 1000

function sessionCacheKey(trainerId, from, to) {
  return `fd-tr-pay-tr:${trainerId}:${from}:${to}`
}

function readSessionTrainings(trainerId, from, to) {
  try {
    const raw = sessionStorage.getItem(sessionCacheKey(trainerId, from, to))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.rows)) return null
    if (Date.now() - Number(parsed.at || 0) > SESSION_CACHE_TTL_MS) return null
    return parsed.rows
  } catch {
    return null
  }
}

function writeSessionTrainings(trainerId, from, to, rows) {
  try {
    sessionStorage.setItem(
      sessionCacheKey(trainerId, from, to),
      JSON.stringify({ at: Date.now(), rows }),
    )
  } catch {
    /* quota / private mode */
  }
}

/**
 * Абонементы клиентов тренера (RLS режет по trainer_id клиента).
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
 * @returns {Promise<{ dayPay: number, monthPay: number, source: string, fallbackReason: string | null }>}
 */
export async function loadTrainerSelfPayrollAmounts(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const dayIso = String(p.dayIso ?? '').slice(0, 10)
  const monthFrom = String(p.monthFrom ?? '').slice(0, 10)
  const monthTo = String(p.monthTo ?? '').slice(0, 10)
  const empty = { dayPay: 0, monthPay: 0, source: 'local', fallbackReason: null }

  if (!trainerId || !clubId || !dayIso || !monthFrom || !monthTo) return empty

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
        writeSessionTrainings(trainerId, loadFrom, loadTo, remote.rows)
        if (remote.partial && remote.warn) fallbackReason = `частично: ${remote.warn}`
      }
    } catch (e) {
      const cached = readSessionTrainings(trainerId, loadFrom, loadTo)
      if (cached?.length) {
        trainings = mergeLocalAndRemoteTrainings(trainings, cached, loadFrom, loadTo)
        source = 'session_cache'
        fallbackReason = e?.message ? String(e.message).slice(0, 80) : 'timeout'
        console.warn('[trainer-payroll] remote fail → session cache', e)
      } else {
        fallbackReason = e?.message ? String(e.message).slice(0, 120) : 'remote_failed'
        console.warn('[trainer-payroll] remote trainings', e)
      }
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

  return {
    dayPay: computeTrainerSelfPayroll({ ...ctx, dateFrom: dayIso, dateTo: dayIso }),
    monthPay: computeTrainerSelfPayroll({ ...ctx, dateFrom: monthFrom, dateTo: monthTo }),
    source,
    fallbackReason,
  }
}
