import { loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import { ADMIN_JOURNAL_MAX_PAGE_SIZE } from '../admin/adminConstants'

/**
 * Журнал завершённых тренировок тренера за период (локально, из workspace).
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
  const trainerId = String(p.trainerId ?? '').trim()
  const dateFrom = String(p.dateFrom ?? '').slice(0, 10)
  const dateTo = String(p.dateTo ?? '').slice(0, 10)
  const page = Math.max(0, Number(p.page) || 0)
  const pageSize = Math.min(Math.max(1, Number(p.pageSize) || 50), ADMIN_JOURNAL_MAX_PAGE_SIZE)

  if (!trainerId || !dateFrom || !dateTo || dateFrom > dateTo) {
    return { trainings: [], clientsById: {}, totalCount: 0, source: 'local', fallbackReason: null }
  }

  const { clients, trainings } = await loadTrainerWorkspaceSnapshot(trainerId, p.clubId ?? null)
  const clientsById = {}
  for (const c of clients) clientsById[c.id] = c

  const filtered = (trainings ?? [])
    .filter((t) => {
      if (t.status !== 'completed') return false
      const d = String(t.date ?? '').slice(0, 10)
      return d && d >= dateFrom && d <= dateTo
    })
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))

  const totalCount = filtered.length
  const start = page * pageSize
  const slice = filtered.slice(start, start + pageSize)

  return {
    trainings: slice,
    clientsById,
    totalCount,
    source: 'local',
    fallbackReason: null,
  }
}
