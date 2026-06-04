import { clearTrainerWorkspaceSnapshotSync, loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import { buildScopePeriodStats } from '../periodStats/buildScopePeriodStats'

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
      source: 'local',
      fallbackReason: null,
      error: !trainerId ? 'no_trainer' : 'bad_range',
    }
  }

  clearTrainerWorkspaceSnapshotSync()
  const { clients, trainings, memByClient } = await loadTrainerWorkspaceSnapshot(trainerId, clubId || null)
  return buildScopePeriodStats({
    clients,
    trainings,
    memByClient,
    clubId,
    dateFrom,
    dateTo,
    trainerIdFilter: trainerId,
  })
}
