import { loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import { getClientsMapByIdsLocal } from '../localDbClubQuery'
import { ADMIN_JOURNAL_MAX_PAGE_SIZE } from '../admin/adminConstants'
import { buildJournalClientsById } from './trainerJournalClientsCore.js'

const emptyJournal = { trainings: [], clientsById: {}, totalCount: 0, source: 'local', fallbackReason: null }

/**
 * Журнал завершённых тренировок тренера за период — весь отфильтрованный список (локально).
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

  const { clients, archivedClients, trainings } = await loadTrainerWorkspaceSnapshot(trainerId, p.clubId ?? null)

  const filtered = (trainings ?? [])
    .filter((t) => {
      if (t.status !== 'completed') return false
      const d = String(t.date ?? '').slice(0, 10)
      return d && d >= dateFrom && d <= dateTo
    })
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))

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
    source: 'local',
    fallbackReason: null,
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
