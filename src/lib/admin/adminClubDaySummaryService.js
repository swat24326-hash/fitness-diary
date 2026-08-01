import {
  listClientsByClubId,
  listMembershipsByClubId,
  listTrainingsByClubIdInRange,
} from '../localDbClubQuery.js'
import { isSupabaseConfigured, supabase } from '../supabase.js'
import { todayLocalIso } from '../dateRu.js'
import { buildAdminClubDaySummary, yesterdayIso } from './adminClubDaySummaryCore.js'
import { querySalesDailyRow } from './adminSalesQueryResilience.js'
import { loadClubTrainingStats } from './adminClubStatsService.js'
import { refreshMembershipsForStats } from '../membershipCacheRefresh.js'
import { isAppOnline } from '../syncService.js'
import { collectHoldingTrainerIds } from './holdingClientsCore.js'
import { fetchTrainersViaAdminApi } from './adminApiClient.js'

/**
 * @param {string} clubId
 * @returns {Promise<{ ok: boolean, reason?: string, summary: ReturnType<typeof buildAdminClubDaySummary> | null, source?: string }>}
 */
export async function loadAdminClubDaySummary(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) {
    return { ok: false, reason: 'no_club', summary: null }
  }

  const today = todayLocalIso()
  const yesterday = yesterdayIso(today)

  if (isSupabaseConfigured() && isAppOnline()) {
    await refreshMembershipsForStats({ clubId: cid, notify: false })
  }

  const [clients, memberships, trainings] = await Promise.all([
    listClientsByClubId(cid),
    listMembershipsByClubId(cid),
    listTrainingsByClubIdInRange(cid, yesterday, today),
  ])
  let holdingTrainerIds = new Set()
  try {
    const viaApi = await fetchTrainersViaAdminApi()
    const trainers = (viaApi?.trainers ?? []).filter(
      (t) => String(t.club_id ?? '') === cid || !t.club_id,
    )
    holdingTrainerIds = collectHoldingTrainerIds(trainers)
  } catch {
    holdingTrainerIds = new Set()
  }

  let inactiveOverride = null
  let trainingsTodayOverride = null
  let trainingsYesterdayOverride = null

  if (isSupabaseConfigured() && isAppOnline()) {
    try {
      // Один light-запрос: completed по byDay + inactive на конец периода (сегодня).
      const rangeStats = await loadClubTrainingStats({
        clubId: cid,
        dateFrom: yesterday,
        dateTo: today,
        includeCoachQuality: false,
      })
      if (!rangeStats?.error) {
        inactiveOverride = rangeStats.inactiveInPeriod ?? null
        const byDay = rangeStats.byDay ?? []
        const tRow = byDay.find((d) => String(d?.date ?? '').slice(0, 10) === today)
        const yRow = byDay.find((d) => String(d?.date ?? '').slice(0, 10) === yesterday)
        if (Number.isFinite(tRow?.completed)) trainingsTodayOverride = tRow.completed
        else if (Number.isFinite(rangeStats.totalCompleted) && !yRow) {
          trainingsTodayOverride = rangeStats.totalCompleted
        }
        if (Number.isFinite(yRow?.completed)) trainingsYesterdayOverride = yRow.completed
      }
    } catch {
      /* локальный кэш ниже */
    }
  }

  let salesReportFilled = null
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await querySalesDailyRow(supabase, cid, today)
      if (error) {
        salesReportFilled = false
      } else {
        salesReportFilled = Boolean(data?.id)
      }
    } catch {
      salesReportFilled = false
    }
  }

  return {
    ok: true,
    summary: buildAdminClubDaySummary({
      today,
      yesterday,
      clients,
      memberships,
      trainings,
      salesReportFilled,
      inactiveOverride,
      trainingsTodayOverride,
      trainingsYesterdayOverride,
      holdingTrainerIds,
    }),
    source: 'local',
  }
}
