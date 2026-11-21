import { loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import {
  aggregateMonthlyForCalendarYear,
  discoverMonthlyChartYears,
  summarizeCalendarYearMonthlyEligibility,
} from '../admin/adminClubMonthlyService'
import {
  aggregateMonthlyAttendanceSeries,
  aggregateMonthlyRetentionM3Series,
} from '../admin/clubMonthlyYearSeriesCore.js'
import { todayInTimeZoneIso } from '../dateRu.js'
import { listMembershipTypesForClub } from '../membershipTypesService.js'

function flattenMemberships(memByClient) {
  const out = []
  for (const list of Object.values(memByClient ?? {})) {
    if (Array.isArray(list)) out.push(...list)
  }
  return out
}

function trainerTrainings(trainings, trainerId) {
  const tid = String(trainerId ?? '').trim()
  return (trainings ?? []).filter((t) => String(t.trainer_id) === tid)
}

/**
 * Итог по календарному году (12 месяцев, только типизированные карты).
 * Не зависит от периода сводки — всегда полный календарный год.
 * @param {{ trainerId: string, clubId: string | null, year: number }} p
 */
export async function loadTrainerMonthlyStatsForYear(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const year = Number(p.year)
  if (!trainerId || !Number.isFinite(year)) {
    return { months: [], years: [], attendance: [], retentionM3: [] }
  }

  const { clients, archivedClients, trainings, memByClient, lifecycleRows } =
    await loadTrainerWorkspaceSnapshot(trainerId, clubId || null)
  const memberships = flattenMemberships(memByClient)
  const mine = trainerTrainings(trainings, trainerId)
  const todayIso = todayInTimeZoneIso()

  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const inYear = mine.filter((t) => {
    const d = String(t?.date ?? '').slice(0, 10)
    return d && d >= yearStart && d <= yearEnd
  })

  let membershipTypes = []
  if (clubId) {
    try {
      membershipTypes = (await listMembershipTypesForClub(clubId)) ?? []
    } catch {
      membershipTypes = []
    }
  }

  const allClients = [...(clients ?? []), ...(archivedClients ?? [])]
  const seriesInput = {
    clients: allClients,
    memberships,
    trainings: mine,
    membershipTypes,
    lifecycleRows: lifecycleRows ?? [],
    year,
    todayIso,
    trainerIdFilter: trainerId,
  }

  return {
    months: aggregateMonthlyForCalendarYear({
      trainings: mine,
      memberships,
      year,
    }),
    years: discoverMonthlyChartYears(mine, { anchorYear: year }),
    yearSummary: summarizeCalendarYearMonthlyEligibility({
      trainings: inYear,
      memberships,
      year,
    }),
    attendance: aggregateMonthlyAttendanceSeries(seriesInput),
    retentionM3: aggregateMonthlyRetentionM3Series(seriesInput),
  }
}

/** @deprecated используйте loadTrainerMonthlyStatsForYear */
export async function loadTrainerMonthlyStats(p) {
  const to = String(p.anchorTo ?? '').slice(0, 10)
  const y = Number(to.slice(0, 4)) || new Date().getFullYear()
  return loadTrainerMonthlyStatsForYear({
    trainerId: p.trainerId,
    clubId: p.clubId,
    year: y,
  })
}
