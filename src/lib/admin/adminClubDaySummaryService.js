import {
  listClientsByClubId,
  listMembershipsByClubId,
  listTrainingsByClubIdInRange,
} from '../localDbClubQuery.js'
import { isSupabaseConfigured, supabase } from '../supabase.js'
import { todayInTimeZoneIso } from '../dateRu.js'
import { buildAdminClubDaySummary, yesterdayIso } from './adminClubDaySummaryCore.js'
import { querySalesDailyRow } from './adminSalesQueryResilience.js'
import { loadClubTrainingStats } from './adminClubStatsService.js'
import { refreshMembershipsForStats } from '../membershipCacheRefresh.js'
import { isAppOnline } from '../syncService.js'
import { collectHoldingTrainerIds } from './holdingClientsCore.js'
import { collectNoTabletTrainerIds } from './trainerTabletModeCore.js'
import { fetchTrainersViaAdminApi } from './adminApiClient.js'
import { HOME_GLANCE_CLOUD_MS, withHomeGlanceTimeout } from './adminHomeGlanceTimeout.js'

/**
 * Сводка дня: сначала локальный census (IndexedDB), облако — параллельно с таймаутом.
 * ERR_CONNECTION_RESET / зависание fetch не оставляют скелетон навсегда.
 *
 * @param {string} clubId
 * @returns {Promise<{ ok: boolean, reason?: string, summary: ReturnType<typeof buildAdminClubDaySummary> | null, source?: string }>}
 */
export async function loadAdminClubDaySummary(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid) {
    return { ok: false, reason: 'no_club', summary: null }
  }

  const today = todayInTimeZoneIso()
  const yesterday = yesterdayIso(today)
  const online = isSupabaseConfigured() && isAppOnline()

  const refreshP = online
    ? withHomeGlanceTimeout(
        refreshMembershipsForStats({ clubId: cid, notify: false, adminClubScope: true }),
        HOME_GLANCE_CLOUD_MS,
      ).catch(() => ({ ok: false, reason: 'refresh_timeout' }))
    : Promise.resolve({ ok: false, reason: 'offline' })

  const idbP = Promise.all([
    listClientsByClubId(cid),
    listMembershipsByClubId(cid),
    listTrainingsByClubIdInRange(cid, yesterday, today),
  ])

  const [refreshRes, idbRows] = await Promise.all([refreshP, idbP])
  let [clients, memberships, trainings] = idbRows
  // После успешного merge абонов в IDB — перечитать, иначе сводка со старым кэшем.
  if (refreshRes?.ok) {
    try {
      memberships = await listMembershipsByClubId(cid)
    } catch {
      /* оставим первый снимок */
    }
  }

  let holdingTrainerIds = new Set()
  let noTabletTrainerIds = new Set()
  try {
    const viaApi = await withHomeGlanceTimeout(fetchTrainersViaAdminApi(), HOME_GLANCE_CLOUD_MS)
    const trainers = (viaApi?.trainers ?? []).filter(
      (t) => String(t.club_id ?? '') === cid || !t.club_id,
    )
    holdingTrainerIds = collectHoldingTrainerIds(trainers)
    noTabletTrainerIds = collectNoTabletTrainerIds(trainers)
  } catch {
    holdingTrainerIds = new Set()
    noTabletTrainerIds = new Set()
  }

  let trainingsTodayOverride = null
  let trainingsYesterdayOverride = null

  if (online) {
    try {
      const rangeStats = await withHomeGlanceTimeout(
        loadClubTrainingStats({
          clubId: cid,
          dateFrom: yesterday,
          dateTo: today,
          includeCoachQuality: false,
        }),
        HOME_GLANCE_CLOUD_MS,
      )
      if (!rangeStats?.error) {
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
      /* локальный кэш trainings */
    }
  }

  let salesReportFilled = null
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await withHomeGlanceTimeout(
        querySalesDailyRow(supabase, cid, today),
        HOME_GLANCE_CLOUD_MS,
      )
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
      trainingsTodayOverride,
      trainingsYesterdayOverride,
      holdingTrainerIds,
      noTabletTrainerIds,
    }),
    source: 'local',
  }
}
