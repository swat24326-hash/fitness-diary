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

  let inactiveOverride = null
  let trainingsTodayOverride = null
  let trainingsYesterdayOverride = null

  if (isSupabaseConfigured() && isAppOnline()) {
    try {
      const [todayStats, rangeStats] = await Promise.all([
        loadClubTrainingStats({ clubId: cid, dateFrom: today, dateTo: today }),
        loadClubTrainingStats({ clubId: cid, dateFrom: yesterday, dateTo: today }),
      ])
      if (!todayStats?.error) {
        inactiveOverride = todayStats.inactiveInPeriod ?? null
        trainingsTodayOverride = todayStats.totalCompleted ?? null
      }
      if (!rangeStats?.error) {
        const byDay = rangeStats.byDay ?? []
        const yRow = byDay.find((d) => String(d?.date ?? '').slice(0, 10) === yesterday)
        if (Number.isFinite(yRow?.completed)) {
          trainingsYesterdayOverride = yRow.completed
        }
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
    }),
    source: 'local',
  }
}
