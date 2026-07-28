/**
 * ЗП на планшете: те же ставки, что в computeTrainerSelfPayroll,
 * но тренировки/абонементы при online — из облака (иначе разные устройства = разные цифры).
 */

import { isSupabaseConfigured, supabase } from '../supabase'
import { isAppOnline } from '../syncService'
import { withSupabaseRetry } from '../supabaseRetry'
import { loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import {
  fetchTrainerTrainingsRemoteInRange,
} from './trainerPeriodStatsService.js'
import { mergeLocalAndRemoteTrainings, mergeRowsById } from './trainerRemoteMerge.js'
import { computeTrainerSelfPayroll } from './trainerSelfPayroll.js'

export { mergeRowsById } from './trainerRemoteMerge.js'

const MEM_PAGE = 500
const MEM_MAX = 8000

/**
 * Абонементы клиентов тренера (RLS режет по trainer_id клиента).
 * @param {string} clubId
 */
export async function fetchTrainerMembershipsRemote(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured() || !supabase) return []

  const out = []
  let fromIdx = 0
  while (out.length < MEM_MAX) {
    const toIdx = fromIdx + MEM_PAGE - 1
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from('memberships')
        .select('id, client_id, club_id, start_date, end_date, total_trainings, used_trainings, membership_type_id')
        .eq('club_id', cid)
        .order('id', { ascending: true })
        .range(fromIdx, toIdx),
    )
    if (error) throw error
    const chunk = Array.isArray(data) ? data : []
    out.push(...chunk)
    if (chunk.length < MEM_PAGE) break
    fromIdx += MEM_PAGE
  }
  return out.slice(0, MEM_MAX)
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
      if (remote.length > 0) {
        trainings = mergeLocalAndRemoteTrainings(trainings, remote, loadFrom, loadTo)
        source = 'remote'
      }
      try {
        const remoteMem = await fetchTrainerMembershipsRemote(clubId)
        if (remoteMem.length > 0) {
          memberships = mergeRowsById(memberships, remoteMem)
          if (source === 'local') source = 'remote'
        }
      } catch (memErr) {
        console.warn('[trainer-payroll] remote memberships', memErr)
        if (!fallbackReason) {
          fallbackReason = memErr?.message
            ? String(memErr.message).slice(0, 120)
            : 'memberships_remote_failed'
        }
      }
    } catch (e) {
      fallbackReason = e?.message ? String(e.message).slice(0, 120) : 'remote_failed'
      console.warn('[trainer-payroll] remote trainings', e)
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
