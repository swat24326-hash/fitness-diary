import { isSupabaseConfigured, supabase } from '../supabase'
import { isAppOnline } from '../syncService'
import { withSupabaseRetry, isRetryableNetworkError } from '../supabaseRetry'
import { clearTrainerWorkspaceSnapshotSync, loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import { buildScopePeriodStats } from '../periodStats/buildScopePeriodStats'
import { previousEqualPeriod } from '../admin/coachQualityBriefCore.js'
import { mergeLocalAndRemoteTrainings } from './trainerRemoteMerge.js'
import { todayLocalIso } from '../dateRu.js'
import { buildCoachQualityForScope } from '../admin/coachQualityService.js'
import { fetchTrainerSelfStatsViaApi } from './trainerSelfStatsApi.js'
import {
  readTrainerSelfStatsLastGood,
  writeTrainerSelfStatsLastGood,
} from './trainerSelfStatsLastGood.js'
import { coachQualityNeedsRemoteTrainings } from './coachQualityRemoteGate.js'

export { mergeLocalAndRemoteTrainings } from './trainerRemoteMerge.js'
export { coachQualityNeedsRemoteTrainings } from './coachQualityRemoteGate.js'

function flattenMemByClient(memByClient) {
  const out = []
  for (const list of Object.values(memByClient ?? {})) {
    if (Array.isArray(list)) out.push(...list)
  }
  return out
}

function countCompletedInRange(trainings, dateFrom, dateTo) {
  let n = 0
  for (const t of trainings ?? []) {
    if (String(t?.status ?? '') !== 'completed') continue
    const d = String(t?.date ?? '').slice(0, 10)
    if (d && d >= dateFrom && d <= dateTo) n += 1
  }
  return n
}

/**
 * API trainer-self-stats не считает CQ (тяжело / care inputs).
 * Добираем с планшета: IDB + при online догрузка облака, если локальных completed меньше API.
 * Можно вызывать вторым шагом после лёгкой сводки (`includeCoachQuality: false`).
 */
export async function ensureTrainerPeriodCoachQuality(period, { trainerId, clubId, dateFrom, dateTo }) {
  if (period?.coachQuality?.trainers?.length) return period
  try {
    const { clients, trainings, memByClient } = await loadTrainerWorkspaceSnapshot(
      trainerId,
      clubId || null,
    )
    const memberships = flattenMemByClient(memByClient)
    const prev = previousEqualPeriod(dateFrom, dateTo)
    const inRange = (trainings ?? []).filter((t) => {
      const d = String(t?.date ?? '').slice(0, 10)
      return d && d >= dateFrom && d <= dateTo
    })
    const previousTrainings = prev
      ? (trainings ?? []).filter((t) => {
          const d = String(t?.date ?? '').slice(0, 10)
          return d && d >= prev.dateFrom && d <= prev.dateTo
        })
      : []
    let trainingsForCq = inRange
    let prevForCq = previousTrainings
    const localCompleted = countCompletedInRange(trainings, dateFrom, dateTo)
    const needRemote = coachQualityNeedsRemoteTrainings({
      localCompleted,
      apiCompleted: period?.totalCompleted,
      online: isSupabaseConfigured() && isAppOnline(),
    })
    if (needRemote) {
      try {
        const fetchFrom = prev?.dateFrom ?? dateFrom
        const remote = await fetchTrainerTrainingsRemoteInRange(trainerId, fetchFrom, dateTo)
        if (remote.rows.length > 0) {
          const merged = mergeLocalAndRemoteTrainings(trainings, remote.rows, fetchFrom, dateTo)
          trainingsForCq = merged.filter((t) => {
            const d = String(t?.date ?? '').slice(0, 10)
            return d && d >= dateFrom && d <= dateTo
          })
          prevForCq = prev
            ? merged.filter((t) => {
                const d = String(t?.date ?? '').slice(0, 10)
                return d && d >= prev.dateFrom && d <= prev.dateTo
              })
            : []
        }
      } catch (e) {
        console.warn('[trainer-stats] coachQuality remote', e)
      }
    }
    const coachQuality = await buildCoachQualityForScope({
      clients,
      trainings: trainingsForCq,
      memberships,
      clubId,
      dateFrom,
      dateTo,
      trainerIdFilter: trainerId,
      previousTrainings: prevForCq,
    })
    return { ...period, coachQuality }
  } catch (e) {
    console.warn('[trainer-stats] coachQuality attach', e)
    return period
  }
}

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
 * @param {{
 *   trainerId: string,
 *   clubId: string | null,
 *   dateFrom: string,
 *   dateTo: string,
 *   includeCoachQuality?: boolean,
 * }} p
 */
export async function loadTrainerPeriodStats(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const { dateFrom, dateTo } = p
  const includeCoachQuality = p.includeCoachQuality !== false
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

  let apiFailReason = null

  if (isAppOnline()) {
    try {
      const today = todayLocalIso()
      // Тот же day, что у панели ЗП (сегодня в периоде) — общий inflight-запрос
      const dayIso = today >= dateFrom && today <= dateTo ? today : dateTo
      const api = await fetchTrainerSelfStatsViaApi({
        dateFrom,
        dateTo,
        dayIso,
        clubId,
      })
      if (api?.period && typeof api.period.totalCompleted === 'number') {
        writeTrainerSelfStatsLastGood(trainerId, dateFrom, dateTo, dayIso, api)
        const period = {
          ...api.period,
          source: 'api',
          fallbackReason: null,
          error: null,
        }
        if (!includeCoachQuality) return { ...period, coachQuality: period.coachQuality ?? null }
        return await ensureTrainerPeriodCoachQuality(period, { trainerId, clubId, dateFrom, dateTo })
      }
      throw new Error('Пустой ответ статистики')
    } catch (e) {
      console.warn('[trainer-stats] api', e)
      const today = todayLocalIso()
      const dayIso = today >= dateFrom && today <= dateTo ? today : dateTo
      const lastGood = readTrainerSelfStatsLastGood(trainerId, dateFrom, dateTo, dayIso)
      const reason = e?.message ? String(e.message) : 'api_failed'
      const reasonShort = reason.slice(0, 160)
      if (lastGood?.period && typeof lastGood.period.totalCompleted === 'number') {
        const period = {
          ...lastGood.period,
          source: 'last_good',
          fallbackReason: reasonShort,
          error: null,
        }
        if (!includeCoachQuality) return { ...period, coachQuality: period.coachQuality ?? null }
        return await ensureTrainerPeriodCoachQuality(period, { trainerId, clubId, dateFrom, dateTo })
      }
      apiFailReason = reasonShort
    }
  }

  const { clients, trainings: localTrainings, memByClient } = await loadTrainerWorkspaceSnapshot(
    trainerId,
    clubId || null,
  )

  let trainings = localTrainings
  let source = 'local'
  let fallbackReason = apiFailReason

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
        } else if (!apiFailReason) {
          fallbackReason = null
        }
      }
    } catch (e) {
      fallbackReason = e?.message ? String(e.message).slice(0, 120) : apiFailReason || 'remote_failed'
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
    includeCoachQuality,
  })
  return { ...stats, source, fallbackReason, error: null }
}
