/**
 * Статистика тренировок по клубу за период (батчами с Supabase / агрегация в IndexedDB).
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { withSupabaseRetry } from '../supabaseRetry'
import {
  listClientsByClubId,
  listMembershipsByClubId,
  listTrainingsByClubIdInRange,
} from '../localDbClubQuery.js'
import { aggregateClubClientPeriod } from './clubClientPeriodAgg'
import { fetchClubTrainingStatsViaApi, fetchTrainersViaAdminApi } from './adminApiClient'
import { ADMIN_SYNC_BATCH_SIZE } from './adminConstants'
import { aggregateMembershipTypeStats } from './membershipTypeStatsAgg'
import { listMembershipTypesForClub } from '../membershipTypesService'
import { buildCoachQualityForScope } from './coachQualityService.js'
import { collectHoldingTrainerIds } from './holdingClientsCore.js'
import { collectNoTabletTrainerIds } from './trainerTabletModeCore.js'
import { previousEqualPeriod } from './coachQualityBriefCore.js'
import {
  aggregateHallMembershipTypeCensus,
  filterTrainingsByClubStatsHall,
  normalizeClubStatsHall,
  sliceClubStatsByHall,
} from './clubStatsHallFilterCore.js'

async function loadTrainerModeIdsForClub(clubId) {
  const cid = String(clubId ?? '').trim()
  try {
    const viaApi = await fetchTrainersViaAdminApi()
    const trainers = (viaApi?.trainers ?? []).filter(
      (t) => !cid || String(t.club_id ?? '') === cid || !t.club_id,
    )
    return {
      holdingTrainerIds: collectHoldingTrainerIds(trainers),
      noTabletTrainerIds: collectNoTabletTrainerIds(trainers),
    }
  } catch {
    return { holdingTrainerIds: new Set(), noTabletTrainerIds: new Set() }
  }
}

export function aggregateTrainings(rows) {
  const dayMap = new Map()
  const trainerMap = new Map()
  const clientSet = new Set()
  let totalCompleted = 0
  let totalDraft = 0

  for (const t of rows) {
    const d = String(t.date ?? '').slice(0, 10)
    if (!d) continue
    const isDone = t.status === 'completed'
    const isDraft = t.status === 'draft'
    if (!isDone && !isDraft) continue

    const tid = t.trainer_id || ''
    if (isDone) totalCompleted++
    if (isDraft) totalDraft++
    if (t.client_id) clientSet.add(t.client_id)

    if (!dayMap.has(d)) dayMap.set(d, { completed: 0, draft: 0 })
    const day = dayMap.get(d)
    if (isDone) day.completed++
    if (isDraft) day.draft++

    if (tid) {
      if (!trainerMap.has(tid)) {
        trainerMap.set(tid, { completed: 0, draft: 0, clientIds: new Set() })
      }
      const tr = trainerMap.get(tid)
      if (isDone) tr.completed++
      if (isDraft) tr.draft++
      if (t.client_id) tr.clientIds.add(t.client_id)
    }
  }

  const byDay = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, completed: v.completed, draft: v.draft }))

  const byTrainer = [...trainerMap.entries()]
    .map(([trainerId, v]) => ({
      trainerId,
      completed: v.completed,
      draft: v.draft,
      uniqueClients: v.clientIds.size,
    }))
    .sort((a, b) => b.completed - a.completed || b.draft - a.draft)

  return {
    totalCompleted,
    totalDraft,
    uniqueClients: clientSet.size,
    totalRows: rows.length,
    byDay,
    byTrainer,
  }
}

/** @param {string} clubId @param {string} dateFrom @param {string} dateTo */
export async function fetchTrainingsForClubRangeRemote(clubId, dateFrom, dateTo) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from('trainings')
        .select('id, trainer_id, client_id, date, status, data')
        .eq('club_id', clubId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1),
    )
    if (error) throw error
    const chunk = data ?? []
    if (!chunk.length) break
    rows.push(...chunk)
    if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return rows
}

async function fetchTrainingsForClubRangeLocal(clubId, dateFrom, dateTo) {
  return listTrainingsByClubIdInRange(clubId, dateFrom, dateTo)
}

async function fetchClientsForClubLocal(clubId) {
  const rows = await listClientsByClubId(clubId)
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    trainer_id: c.trainer_id,
    archived_at: c.archived_at,
    lifecycle: c.lifecycle ?? null,
    pnk_stage: c.pnk_stage ?? null,
    desk_hall: c.desk_hall ?? null,
  }))
}

async function fetchMembershipsForClubLocal(clubId) {
  return listMembershipsByClubId(clubId)
}

export async function fetchClientsForClubRemote(clubId) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from('clients')
        .select('id, name, phone, trainer_id, archived_at, lifecycle, pnk_stage, desk_hall')
        .eq('club_id', clubId)
        .order('id', { ascending: true })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1),
    )
    if (error) throw error
    const chunk = data ?? []
    if (!chunk.length) break
    rows.push(...chunk)
    if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return rows
}

export async function fetchMembershipsForClubRemote(clubId) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('memberships')
      .select('id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id, hall')
      .eq('club_id', clubId)
      .order('id', { ascending: true })
      .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1)
    if (error) throw error
    const chunk = data ?? []
    if (!chunk.length) break
    rows.push(...chunk)
    if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return rows
}

export { aggregateClubClientPeriod } from './clubClientPeriodAgg'

async function membershipTypeStatsSlice(clubId, trainings, memberships, clients, hall) {
  const membershipTypes = await listMembershipTypesForClub(clubId)
  if (hall === 'tz' || hall === 'az') {
    const sliced = sliceClubStatsByHall(clients, memberships, hall)
    return aggregateHallMembershipTypeCensus({
      memberships: sliced.memberships,
      membershipTypes,
    })
  }
  return aggregateMembershipTypeStats({ trainings, memberships, membershipTypes })
}

async function attachCoachQuality(stats, { clubId, dateFrom, dateTo, clients, trainings, memberships, holdingTrainerIds, noTabletTrainerIds }) {
  try {
    const prevRange = previousEqualPeriod(dateFrom, dateTo)
    let previousTrainings = []
    if (prevRange) {
      previousTrainings = await fetchTrainingsForClubRangeLocal(
        clubId,
        prevRange.dateFrom,
        prevRange.dateTo,
      ).catch(() => [])
    }
    const coachQuality = await buildCoachQualityForScope({
      clubId,
      dateFrom,
      dateTo,
      clients,
      trainings,
      memberships,
      previousTrainings,
      holdingTrainerIds,
      noTabletTrainerIds,
    })
    return { ...stats, coachQuality }
  } catch (e) {
    console.warn('[admin] coachQuality', e)
    return { ...stats, coachQuality: null }
  }
}

/**
 * Добирает CQ, если в сводке его ещё нет (второй шаг после лёгкой загрузки).
 * @param {object} period
 * @param {{ clubId: string, dateFrom: string, dateTo: string }} p
 */
export async function ensureClubPeriodCoachQuality(period, { clubId, dateFrom, dateTo }) {
  if (period?.coachQuality?.trainers?.length) return period
  const cid = String(clubId ?? '').trim()
  if (!cid || !dateFrom || !dateTo || dateFrom > dateTo) {
    return { ...period, coachQuality: period?.coachQuality ?? null }
  }

  let [rows, clients, memberships] = await Promise.all([
    fetchTrainingsForClubRangeLocal(cid, dateFrom, dateTo).catch(() => []),
    fetchClientsForClubLocal(cid).catch(() => []),
    fetchMembershipsForClubLocal(cid).catch(() => []),
  ])
  const localThin = !clients.length || (!rows.length && !memberships.length)
  const needData =
    localThin && ((period?.totalCompleted ?? 0) > 0 || (period?.totalClients ?? 0) > 0)
  if (needData && isSupabaseConfigured()) {
    try {
      ;[rows, clients, memberships] = await Promise.all([
        fetchTrainingsForClubRangeRemote(cid, dateFrom, dateTo),
        fetchClientsForClubRemote(cid),
        fetchMembershipsForClubRemote(cid),
      ])
    } catch (remoteErr) {
      console.warn('[admin] coachQuality remote fill', remoteErr)
    }
  }
  if (!clients.length) return { ...period, coachQuality: period?.coachQuality ?? null }
  return attachCoachQuality(period, {
    clubId: cid,
    dateFrom,
    dateTo,
    clients,
    trainings: rows,
    memberships,
  })
}

/**
 * @param {{
 *   clubId: string,
 *   dateFrom: string,
 *   dateTo: string,
 *   includeCoachQuality?: boolean,
 *   hall?: string|null,
 * }} p — даты ISO yyyy-mm-dd
 */
export async function loadClubTrainingStats(p) {
  const { clubId, dateFrom, dateTo } = p
  const hallExplicit =
    Object.prototype.hasOwnProperty.call(p, 'hall') &&
    p.hall != null &&
    String(p.hall).trim() !== ''
  const hall = hallExplicit ? normalizeClubStatsHall(p.hall) || 'pz' : null
  const includeCoachQuality = p.includeCoachQuality !== false && (!hall || hall === 'pz')
  const base = {
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
    hall: hall || null,
    source: 'local',
    fallbackReason: null,
    error: null,
  }

  if (!clubId || !dateFrom || !dateTo || dateFrom > dateTo) {
    return { ...base, error: !clubId ? 'no_club' : 'bad_range' }
  }

  const modeIds = await loadTrainerModeIdsForClub(clubId)
  const periodOpts = hall ? { ...modeIds, hall } : modeIds
  const clientSlice = (clients, memberships) =>
    aggregateClubClientPeriod(clients, memberships, dateFrom, dateTo, undefined, periodOpts)
  const trainingSlice = (rows, memberships, clients) =>
    hall ? filterTrainingsByClubStatsHall(rows, memberships, clients, hall) : rows
  const maybeAttach = async (stats, ctx) => {
    if (!includeCoachQuality) return { ...stats, coachQuality: stats.coachQuality ?? null }
    return attachCoachQuality(stats, { ...ctx, ...modeIds })
  }

  if (!isSupabaseConfigured()) {
    const [rows, clients, memberships] = await Promise.all([
      fetchTrainingsForClubRangeLocal(clubId, dateFrom, dateTo),
      fetchClientsForClubLocal(clubId),
      fetchMembershipsForClubLocal(clubId),
    ])
    const hallRows = trainingSlice(rows, memberships, clients)
    return maybeAttach(
      {
        ...base,
        ...aggregateTrainings(hallRows),
        ...clientSlice(clients, memberships),
        ...(await membershipTypeStatsSlice(clubId, hallRows, memberships, clients, hall)),
        source: 'local',
      },
      { clubId, dateFrom, dateTo, clients, trainings: hallRows, memberships },
    )
  }

  try {
    const viaApi = await fetchClubTrainingStatsViaApi({
      clubId,
      dateFrom,
      dateTo,
      includeCq: includeCoachQuality,
      ...(hall ? { hall } : {}),
    })
    if (viaApi) {
      const stats = {
        ...base,
        totalCompleted: viaApi.totalCompleted ?? 0,
        totalDraft: viaApi.totalDraft ?? 0,
        uniqueClients: viaApi.uniqueClients ?? 0,
        totalRows: viaApi.totalRows ?? 0,
        byDay: viaApi.byDay ?? [],
        byTrainer: viaApi.byTrainer ?? [],
        byType: viaApi.byType ?? [],
        byTrainerByType: viaApi.byTrainerByType ?? [],
        totalCounted: viaApi.totalCounted ?? 0,
        totalClients: viaApi.totalClients ?? 0,
        activeWithMembership: viaApi.activeWithMembership ?? 0,
        inactiveInPeriod: viaApi.inactiveInPeriod ?? (viaApi.inactiveClients ?? []).length,
        inactiveClients: viaApi.inactiveClients ?? [],
        notRenewedInPeriod: viaApi.notRenewedInPeriod ?? 0,
        notRenewedClients: viaApi.notRenewedClients ?? [],
        hall: viaApi.hall || hall,
        coachQuality: viaApi.coachQuality ?? null,
        source: 'admin_api',
        fallbackReason: null,
        error: null,
      }
      if (viaApi.coachQuality || !includeCoachQuality) return stats

      let [rows, clients, memberships] = await Promise.all([
        fetchTrainingsForClubRangeLocal(clubId, dateFrom, dateTo).catch(() => []),
        fetchClientsForClubLocal(clubId).catch(() => []),
        fetchMembershipsForClubLocal(clubId).catch(() => []),
      ])
      const localThin = !clients.length || (!rows.length && !memberships.length)
      if (localThin && (viaApi.totalCompleted > 0 || viaApi.totalClients > 0)) {
        try {
          ;[rows, clients, memberships] = await Promise.all([
            fetchTrainingsForClubRangeRemote(clubId, dateFrom, dateTo),
            fetchClientsForClubRemote(clubId),
            fetchMembershipsForClubRemote(clubId),
          ])
        } catch (remoteErr) {
          console.warn('[admin] coachQuality remote fill', remoteErr)
        }
      }
      if (clients.length) {
        const hallRows = trainingSlice(rows, memberships, clients)
        return attachCoachQuality(stats, {
          clubId,
          dateFrom,
          dateTo,
          clients,
          trainings: hallRows,
          memberships,
        })
      }
      return stats
    }
  } catch (apiErr) {
    const msg = String(apiErr?.message ?? '')
    if (!/failed to fetch|connection reset|timeout/i.test(msg)) {
      console.warn('[admin] club-training-stats api', apiErr)
    }
  }

  try {
    const [rows, clients, memberships] = await Promise.all([
      fetchTrainingsForClubRangeRemote(clubId, dateFrom, dateTo),
      fetchClientsForClubRemote(clubId),
      fetchMembershipsForClubRemote(clubId),
    ])
    const hallRows = trainingSlice(rows, memberships, clients)
    return maybeAttach(
      {
        ...base,
        ...aggregateTrainings(hallRows),
        ...clientSlice(clients, memberships),
        ...(await membershipTypeStatsSlice(clubId, hallRows, memberships, clients, hall)),
        source: 'remote',
      },
      { clubId, dateFrom, dateTo, clients, trainings: hallRows, memberships },
    )
  } catch (e) {
    const [rows, clients, memberships] = await Promise.all([
      fetchTrainingsForClubRangeLocal(clubId, dateFrom, dateTo),
      fetchClientsForClubLocal(clubId),
      fetchMembershipsForClubLocal(clubId),
    ])
    const hallRows = trainingSlice(rows, memberships, clients)
    return maybeAttach(
      {
        ...base,
        ...aggregateTrainings(hallRows),
        ...clientSlice(clients, memberships),
        ...(await membershipTypeStatsSlice(clubId, hallRows, memberships, clients, hall)),
        source: 'local',
        fallbackReason: e?.message ? String(e.message) : 'Статистика с сервера недоступна',
      },
      { clubId, dateFrom, dateTo, clients, trainings: hallRows, memberships },
    )
  }
}
