import {
  listClientsByClubId,
  listMembershipsByClubId,
  listTrainingsByClubIdInRange,
} from '../localDbClubQuery.js'
import { isSupabaseConfigured, supabase } from '../supabase.js'
import { todayLocalIso } from '../dateRu.js'
import { buildAdminClubDaySummary, yesterdayIso } from './adminClubDaySummaryCore.js'
import { querySalesDailyRow } from './adminSalesQueryResilience.js'

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

  const [clients, memberships, trainings] = await Promise.all([
    listClientsByClubId(cid),
    listMembershipsByClubId(cid),
    listTrainingsByClubIdInRange(cid, yesterday, today),
  ])

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
    }),
    source: 'local',
  }
}
