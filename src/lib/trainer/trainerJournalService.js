import { loadTrainerWorkspaceSnapshot, clearTrainerWorkspaceSnapshotSync } from '../trainerWorkspaceCache'
import { getClientsMapByIdsLocal } from '../localDbClubQuery'
import { ADMIN_JOURNAL_MAX_PAGE_SIZE } from '../admin/adminConstants'
import { buildJournalClientsById } from './trainerJournalClientsCore.js'
import { filterCompletedTrainingsInDateRange } from './trainerJournalFilterCore.js'
import { fetchTrainerSelfJournalViaApi } from './trainerSelfJournalApi.js'
import { fetchTrainerTrainingsRemoteInRange } from './trainerPeriodStatsService.js'
import { mergeLocalAndRemoteTrainings } from './trainerRemoteMerge.js'
import { isSupabaseConfigured } from '../supabase'
import { isAppOnline } from '../syncService'

const emptyJournal = {
  trainings: [],
  clientsById: {},
  totalCount: 0,
  source: 'local',
  fallbackReason: null,
}

/**
 * Журнал завершённых тренировок тренера за период.
 * Онлайн: сначала тот же контур, что цифры статистики (API), иначе merge облако+IDB.
 * Офлайн: только IndexedDB.
 * @param {{
 *   trainerId: string,
 *   clubId: string | null,
 *   dateFrom: string,
 *   dateTo: string,
 * }} p
 */
export async function loadTrainerJournalFiltered(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const dateFrom = String(p.dateFrom ?? '').slice(0, 10)
  const dateTo = String(p.dateTo ?? '').slice(0, 10)

  if (!trainerId || !dateFrom || !dateTo || dateFrom > dateTo) {
    return emptyJournal
  }

  clearTrainerWorkspaceSnapshotSync()

  if (isAppOnline()) {
    try {
      const viaApi = await fetchTrainerSelfJournalViaApi({
        dateFrom,
        dateTo,
        clubId: p.clubId ?? null,
      })
      const filtered = filterCompletedTrainingsInDateRange(viaApi.trainings, dateFrom, dateTo)
      let clientsById = { ...(viaApi.clientsById ?? {}) }
      const missingIds = [
        ...new Set(
          filtered
            .map((t) => String(t?.client_id ?? '').trim())
            .filter((id) => id && !clientsById[id]),
        ),
      ]
      if (missingIds.length) {
        const extra = await getClientsMapByIdsLocal(missingIds)
        clientsById = { ...clientsById, ...extra }
      }
      return {
        trainings: filtered,
        clientsById,
        totalCount: filtered.length,
        source: 'api',
        fallbackReason: viaApi.truncated ? 'список обрезан по лимиту сервера' : null,
      }
    } catch (e) {
      console.warn('[trainer-journal] api', e)
      // ниже — локальный / remote fallback
    }
  }

  const { clients, archivedClients, trainings: localTrainings } = await loadTrainerWorkspaceSnapshot(
    trainerId,
    p.clubId ?? null,
  )

  let trainings = localTrainings
  let source = 'local'
  let fallbackReason = null

  if (isSupabaseConfigured() && isAppOnline()) {
    try {
      const remote = await fetchTrainerTrainingsRemoteInRange(trainerId, dateFrom, dateTo)
      if (remote.rows.length > 0) {
        trainings = mergeLocalAndRemoteTrainings(localTrainings, remote.rows, dateFrom, dateTo)
        source = remote.partial ? 'remote_partial' : 'remote'
        if (remote.partial && remote.warn) {
          fallbackReason = `частично: ${remote.warn}`
        }
      }
    } catch (e) {
      fallbackReason = e?.message ? String(e.message).slice(0, 120) : 'remote_failed'
      console.warn('[trainer-journal] remote', e)
    }
  }

  const filtered = filterCompletedTrainingsInDateRange(trainings, dateFrom, dateTo)

  let clientsById = buildJournalClientsById(clients, archivedClients)
  const missingIds = [
    ...new Set(
      filtered
        .map((t) => String(t?.client_id ?? '').trim())
        .filter((id) => id && !clientsById[id]),
    ),
  ]
  if (missingIds.length) {
    const extra = await getClientsMapByIdsLocal(missingIds)
    clientsById = buildJournalClientsById(clients, archivedClients, Object.values(extra))
  }

  return {
    trainings: filtered,
    clientsById,
    totalCount: filtered.length,
    source,
    fallbackReason,
  }
}

/**
 * Страница журнала (нарезка уже отфильтрованного списка).
 * @param {{
 *   trainerId: string,
 *   clubId: string | null,
 *   page?: number,
 *   pageSize?: number,
 *   dateFrom: string,
 *   dateTo: string,
 * }} p
 */
export async function loadTrainerJournalPage(p) {
  const page = Math.max(0, Number(p.page) || 0)
  const pageSize = Math.min(Math.max(1, Number(p.pageSize) || 50), ADMIN_JOURNAL_MAX_PAGE_SIZE)
  const all = await loadTrainerJournalFiltered(p)
  const start = page * pageSize
  return {
    ...all,
    trainings: all.trainings.slice(start, start + pageSize),
  }
}
