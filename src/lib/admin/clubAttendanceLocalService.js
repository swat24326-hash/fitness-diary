/**
 * Локальный (IDB) расчёт посещаемости клуба — fallback, пока action ещё не на проде / офлайн.
 * При тонком кэше подтягивает клиентов / абоны / визиты с сервера.
 */

import { addDaysToIso, clampIsoDateToToday, todayLocalIso } from '../dateRu.js'
import { ATTENDANCE_GLANCE_WINDOW_DAYS } from '../clientAttendanceGlanceCore.js'
import { isSupabaseConfigured } from '../supabase.js'
import { isAppOnline } from '../networkReachability.js'
import {
  listClientsByClubId,
  listMembershipsByClubId,
  listTrainingsByClubIdInRange,
} from '../localDbClubQuery.js'
import { loadAdminClubLifecycleRowsFromLocal } from './adminClientsListLifecycleCore.js'
import { fetchTrainersViaAdminApi } from './adminApiClient.js'
import {
  fetchClientsForClubRemote,
  fetchMembershipsForClubRemote,
  fetchTrainingsForClubRangeRemote,
} from './adminClubStatsService.js'
import { collectHoldingTrainerIds } from './holdingClientsCore.js'
import { collectNoTabletTrainerIds } from './trainerTabletModeCore.js'
import { aggregateClubAttendance } from './clubAttendanceAggCore.js'

/**
 * @param {{
 *   clubId: string,
 *   dateFrom?: string,
 *   dateTo: string,
 *   trainerIdFilter?: string | null,
 *   hintCompletedInPeriod?: number,
 * }} opts
 */
export async function loadClubAttendanceFromLocal(opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const dateToRaw = String(opts.dateTo ?? '').slice(0, 10)
  if (!clubId || !/^\d{4}-\d{2}-\d{2}$/.test(dateToRaw)) {
    return null
  }

  const dateTo = clampIsoDateToToday(dateToRaw)
  const trainFrom = addDaysToIso(dateTo, -90)
  const hintCompleted = Number(opts.hintCompletedInPeriod) || 0
  const canRemote = isSupabaseConfigured() && isAppOnline()

  let [clients, memberships, trainings, lifecycleRows] = await Promise.all([
    listClientsByClubId(clubId),
    listMembershipsByClubId(clubId),
    listTrainingsByClubIdInRange(clubId, trainFrom, dateTo),
    loadAdminClubLifecycleRowsFromLocal(clubId),
  ])

  const localClientsThin = !clients.length
  const localMemThin = !memberships.length
  const localCompleted = trainings.filter((t) => String(t?.status ?? '').toLowerCase() === 'completed').length
  const localTrainingsThin =
    !trainings.length ||
    (hintCompleted > 0 && localCompleted < Math.max(3, Math.floor(hintCompleted * 0.4)))
  const shouldRemote =
    canRemote &&
    (localTrainingsThin || localClientsThin || localMemThin) &&
    (hintCompleted > 0 || clients.length > 0 || memberships.length > 0 || localClientsThin)

  let usedRemote = false
  if (shouldRemote) {
    try {
      const tasks = []
      if (localClientsThin) tasks.push(fetchClientsForClubRemote(clubId).then((r) => ({ kind: 'c', r })))
      if (localMemThin) tasks.push(fetchMembershipsForClubRemote(clubId).then((r) => ({ kind: 'm', r })))
      if (localTrainingsThin) {
        tasks.push(
          fetchTrainingsForClubRangeRemote(clubId, trainFrom, dateTo).then((r) => ({ kind: 't', r })),
        )
      }
      const filled = await Promise.all(tasks)
      for (const item of filled) {
        if (item.kind === 'c' && item.r?.length) {
          clients = item.r
          usedRemote = true
        }
        if (item.kind === 'm' && item.r?.length) {
          memberships = item.r
          usedRemote = true
        }
        if (item.kind === 't' && item.r?.length) {
          trainings = item.r
          usedRemote = true
        }
      }
    } catch {
      /* остаёмся на IDB */
    }
  }

  let holdingTrainerIds = new Set()
  let noTabletTrainerIds = new Set()
  try {
    const viaApi = await fetchTrainersViaAdminApi()
    const trainers = (viaApi?.trainers ?? []).filter(
      (t) => String(t.club_id ?? '') === clubId || !t.club_id,
    )
    holdingTrainerIds = collectHoldingTrainerIds(trainers)
    noTabletTrainerIds = collectNoTabletTrainerIds(trainers)
  } catch {
    /* без режимов тренеров — пул шире, лучше чем пусто */
  }

  const clientAttendance = aggregateClubAttendance({
    clients,
    memberships,
    trainings,
    dateTo,
    trainerIdFilter: opts.trainerIdFilter ?? null,
    holdingTrainerIds,
    noTabletTrainerIds,
    lifecycleRows: lifecycleRows ?? [],
    truncated: false,
  })

  const windowFrom = addDaysToIso(dateTo, -(ATTENDANCE_GLANCE_WINDOW_DAYS - 1))
  // Визиты «не загрузились», только если строк тренировок так и нет (не «все по нулям»).
  const visitsMissing =
    clientAttendance.poolSize > 0 &&
    (clientAttendance.totalVisitsInWindow ?? 0) === 0 &&
    !trainings.length

  return {
    ...clientAttendance,
    periodFrom: String(opts.dateFrom ?? windowFrom).slice(0, 10),
    periodTo: dateToRaw,
    asOf: dateTo,
    windowFrom,
    source: usedRemote ? 'remote_fill' : 'local',
    visitsDataMissing: visitsMissing,
  }
}

export { todayLocalIso }
