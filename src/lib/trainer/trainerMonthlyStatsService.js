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
  const clipFrom = p.clipFrom ? String(p.clipFrom).slice(0, 10) : ''
  const clipTo = p.clipTo ? String(p.clipTo).slice(0, 10) : ''
  if (!trainerId || !Number.isFinite(year)) return { months: [], years: [] }

  const { trainings, memByClient } = await loadTrainerWorkspaceSnapshot(trainerId, clubId || null)
  const memberships = flattenMemberships(memByClient)
  const mine = trainerTrainings(trainings, trainerId)

  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const dateFrom = clipFrom && clipFrom > yearStart ? clipFrom : yearStart
  const dateTo = clipTo && clipTo < yearEnd ? clipTo : yearEnd
  const inRange = mine.filter((t) => {
    const d = String(t?.date ?? '').slice(0, 10)
    return d && d >= dateFrom && d <= dateTo
  })

  return {
    months: aggregateMonthlyForCalendarYear({
      trainings: mine,
      memberships,
      year,
      clipFrom: clipFrom || undefined,
      clipTo: clipTo || undefined,
    }),
    years: discoverMonthlyChartYears(mine, { anchorYear: year }),
    yearSummary: summarizeCalendarYearMonthlyEligibility({
      trainings: inRange,
      memberships,
      year,
      clipFrom: clipFrom || undefined,
      clipTo: clipTo || undefined,
    }),
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
