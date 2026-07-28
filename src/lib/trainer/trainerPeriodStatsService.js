import { withSupabaseRetry, isRetryableNetworkError } from '../supabaseRetry'
import { clearTrainerWorkspaceSnapshotSync, loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import { buildScopePeriodStats } from '../periodStats/buildScopePeriodStats'
import { previousEqualPeriod } from '../admin/coachQualityBriefCore.js'
import { isSupabaseConfigured, supabase } from '../supabase'
import { isAppOnline } from '../syncService'
import { mergeLocalAndRemoteTrainings } from './trainerRemoteMerge.js'

export { mergeLocalAndRemoteTrainings } from './trainerRemoteMerge.js'

/** Колонки trainings на проде (без membership_id/updated_at — их нет в таблице). */
export const TRAINER_TRAININGS_REMOTE_SELECT =
  'id, trainer_id, client_id, club_id, date, status, data'

/** Планшет / слабый Wi‑Fi: дефолт supabaseRetry 6с даёт ложный timeout. */
export const TRAINER_REMOTE_RETRY = {
  timeoutMs: 22_000,
  attempts: 4,
  baseDelayMs: 800,
  serialize: true,
}

const REMOTE_PAGE = 500
const REMOTE_MAX = 8000

/**
 * Тренировки тренера за период из облака (RLS: свои строки).
 * Нужно: локальный кэш режется retention (~120 дней), а профиль смотрит старые месяцы.
 * При обрыве после части страниц — отдаём уже скачанное (лучше, чем полный откат на кэш).
 * @param {string} trainerId
 * @param {string} dateFrom
 * @param {string} dateTo
 * @param {{ timeoutMs?: number, attempts?: number }} [opts]
 * @returns {Promise<{ rows: object[], partial: boolean, warn: string | null }>}
 */
export async function fetchTrainerTrainingsRemoteInRange(trainerId, dateFrom, dateTo, opts = {}) {
  const tid = String(trainerId ?? '').trim()
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!tid || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return { rows: [], partial: false, warn: null }
  }
  if (!isSupabaseConfigured() || !supabase) return { rows: [], partial: false, warn: null }

  const retryOpts = {
    ...TRAINER_REMOTE_RETRY,
    ...(opts.timeoutMs != null ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.attempts != null ? { attempts: opts.attempts } : {}),
  }

  const out = []
  let fromIdx = 0
  while (out.length < REMOTE_MAX) {
    const toIdx = fromIdx + REMOTE_PAGE - 1
    try {
      const { data, error } = await withSupabaseRetry(
        () =>
          supabase
            .from('trainings')
            .select(TRAINER_TRAININGS_REMOTE_SELECT)
            .eq('trainer_id', tid)
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: true })
            .order('id', { ascending: true })
            .range(fromIdx, toIdx),
        retryOpts,
      )
      if (error) throw error
      const chunk = Array.isArray(data) ? data : []
      out.push(...chunk)
      if (chunk.length < REMOTE_PAGE) break
      fromIdx += REMOTE_PAGE
    } catch (e) {
      if (out.length > 0 && isRetryableNetworkError(e)) {
        return {
          rows: out.slice(0, REMOTE_MAX),
          partial: true,
          warn: e?.message ? String(e.message).slice(0, 80) : 'partial',
        }
      }
      throw e
    }
  }
  return { rows: out.slice(0, REMOTE_MAX), partial: false, warn: null }
}

/**
 * @param {{ trainerId: string, clubId: string | null, dateFrom: string, dateTo: string }} p
 */
export async function loadTrainerPeriodStats(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const { dateFrom, dateTo } = p
  if (!trainerId || !dateFrom || !dateTo || dateFrom > dateTo) {
    return {
      totalCompleted: 0,
      totalDraft: 0,
      uniqueClients: 0,
      totalRows: 0,
      byDay: [],
      byTrainer: [],
      byType: [],
      byTrainerByType: [],
      totalCounted: 0,
      totalClients: 0,
      activeWithMembership: 0,
      inactiveInPeriod: 0,
      inactiveClients: [],
      notRenewedInPeriod: 0,
      notRenewedClients: [],
      coachQuality: null,
      source: 'local',
      fallbackReason: null,
      error: !trainerId ? 'no_trainer' : 'bad_range',
    }
  }

  clearTrainerWorkspaceSnapshotSync()
  const { clients, trainings: localTrainings, memByClient } = await loadTrainerWorkspaceSnapshot(
    trainerId,
    clubId || null,
  )

  let trainings = localTrainings
  let source = 'local'
  let fallbackReason = null

  if (isSupabaseConfigured() && isAppOnline()) {
    try {
      const prev = previousEqualPeriod(dateFrom, dateTo)
      const fetchFrom = prev?.dateFrom ?? dateFrom
      const remote = await fetchTrainerTrainingsRemoteInRange(trainerId, fetchFrom, dateTo)
      if (remote.rows.length > 0) {
        trainings = mergeLocalAndRemoteTrainings(localTrainings, remote.rows, fetchFrom, dateTo)
        source = remote.partial ? 'remote_partial' : 'remote'
        if (remote.partial && remote.warn) {
          fallbackReason = `частично: ${remote.warn}`
        }
      }
    } catch (e) {
      fallbackReason = e?.message ? String(e.message).slice(0, 120) : 'remote_failed'
      console.warn('[trainer-stats] remote trainings', e)
    }
  }

  const stats = await buildScopePeriodStats({
    clients,
    trainings,
    memByClient,
    clubId,
    dateFrom,
    dateTo,
    trainerIdFilter: trainerId,
  })
  return { ...stats, source, fallbackReason, error: null }
}
