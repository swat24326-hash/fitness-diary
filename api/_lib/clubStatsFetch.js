import { fetchPagedLimited } from './fetchPagedLimited.js'
import {
  CLUB_STATS_MAX_CLIENTS,
  CLUB_STATS_MAX_MEMBERSHIPS,
  CLUB_STATS_MAX_TRAININGS,
} from './apiLimits.js'

const MEMBERSHIP_TYPES_SELECT =
  'id, code, name, sort_order, is_active, is_pnk_trial, trainer_assignable, trainer_pay_per_session, aerobic_pay_amount'

/**
 * Общая загрузка сырых данных для club-stats и ИСКРА (лимиты памяти Vercel).
 * @returns {Promise<{
 *   trainings: object[],
 *   clients: object[],
 *   memberships: object[],
 *   membershipTypes: object[],
 *   truncated: boolean,
 * }>}
 */
export async function fetchClubStatsRaw(
  supabaseAdmin,
  {
    clubId,
    dateFrom,
    dateTo,
    membershipTypesSelect = 'id, code, name, sort_order, is_active, is_pnk_trial',
  },
) {
  const cid = String(clubId ?? '').trim()
  const from = String(dateFrom ?? '').trim()
  const to = String(dateTo ?? '').trim()
  if (!cid || !from || !to) {
    return { trainings: [], clients: [], memberships: [], membershipTypes: [], truncated: false }
  }

  const [trainingsRes, clientsRes, membershipsRes, typesRes] = await Promise.all([
    fetchPagedLimited(supabaseAdmin, {
      table: 'trainings',
      select: 'id, trainer_id, client_id, date, status, data',
      clubId: cid,
      dateFrom: from,
      dateTo: to,
      maxRows: CLUB_STATS_MAX_TRAININGS,
    }),
    fetchPagedLimited(supabaseAdmin, {
      table: 'clients',
      select: 'id, name, phone, archived_at, trainer_id, lifecycle, pnk_stage',
      clubId: cid,
      maxRows: CLUB_STATS_MAX_CLIENTS,
    }),
    fetchPagedLimited(supabaseAdmin, {
      table: 'memberships',
      select: 'id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id',
      clubId: cid,
      maxRows: CLUB_STATS_MAX_MEMBERSHIPS,
    }),
    fetchPagedLimited(supabaseAdmin, {
      table: 'membership_types',
      select: membershipTypesSelect || MEMBERSHIP_TYPES_SELECT,
      clubId: cid,
      maxRows: 5000,
    }),
  ])

  return {
    trainings: trainingsRes.rows,
    clients: clientsRes.rows,
    memberships: membershipsRes.rows,
    membershipTypes: typesRes.rows,
    truncated:
      trainingsRes.truncated || clientsRes.truncated || membershipsRes.truncated || typesRes.truncated,
  }
}
