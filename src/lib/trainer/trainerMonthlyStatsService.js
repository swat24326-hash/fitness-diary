import { loadTrainerWorkspaceSnapshot } from '../trainerWorkspaceCache'
import {
  aggregateMonthlyForCalendarYear,
  discoverMonthlyChartYears,
  summarizeCalendarYearMonthlyEligibility,
} from '../admin/adminClubMonthlyService'

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
 * @param {{ trainerId: string, clubId: string | null, year: number }} p
 */
export async function loadTrainerMonthlyStatsForYear(p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const year = Number(p.year)
  if (!trainerId || !Number.isFinite(year)) return { months: [], years: [] }

  const { trainings, memByClient } = await loadTrainerWorkspaceSnapshot(trainerId, clubId || null)
  const memberships = flattenMemberships(memByClient)
  const mine = trainerTrainings(trainings, trainerId)

  const inYear = mine.filter((t) => String(t?.date ?? '').slice(0, 4) === String(year))
  return {
    months: aggregateMonthlyForCalendarYear({ trainings: mine, memberships, year }),
    years: discoverMonthlyChartYears(mine, { anchorYear: year }),
    yearSummary: summarizeCalendarYearMonthlyEligibility({ trainings: inYear, memberships, year }),
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
