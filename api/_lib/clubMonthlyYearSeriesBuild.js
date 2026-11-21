/**
 * Сборка attendance + retentionM3 серий для club-monthly?year=.
 */

import { todayInTimeZoneIso } from '../../src/lib/dateRu.js'
import {
  aggregateMonthlyAttendanceSeries,
  aggregateMonthlyRetentionM3Series,
  resolveClubMonthlySeriesTrainingFrom,
  clubMonthlySeriesTrainingTo,
} from '../../src/lib/admin/clubMonthlyYearSeriesCore.js'
import { fetchClubTrainerModeIds } from './clubTrainerModeIds.js'
import { fetchPagedLimited } from './fetchPagedLimited.js'
import {
  CLUB_STATS_MAX_CLIENTS,
  CLUB_STATS_MAX_MEMBERSHIPS,
  CLUB_STATS_MAX_TRAININGS,
  CLUB_STATS_MAX_CLIENT_HALL_LIFECYCLE,
} from './apiLimits.js'

const LIFECYCLE_SELECT =
  'id, client_id, club_id, hall, closed_at, close_reason, close_reason_at, expected_return_on, updated_at'

const CLIENT_SELECT =
  'id, name, phone, archived_at, archive_reason, trainer_id, lifecycle, pnk_stage, pnk_won_at, desk_hall'

const MEMBERSHIP_SELECT =
  'id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id, hall'

const MEMBERSHIP_TYPES_SELECT =
  'id, code, sort_order, is_active, is_pnk_trial, trainer_assignable, counts_toward_pay_plan'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ clubId: string, year: number, trainerIdFilter?: string | null }} opts
 */
export async function buildClubMonthlyYearHealthSeries(supabaseAdmin, opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const year = Number(opts.year)
  const trainerIdFilter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : null
  const todayIso = todayInTimeZoneIso()

  if (!clubId || !Number.isFinite(year)) {
    return { attendance: [], retentionM3: [], truncated: false }
  }

  const trainFrom = resolveClubMonthlySeriesTrainingFrom(year, todayIso)
  const trainTo = clubMonthlySeriesTrainingTo(year, todayIso)
  if (!trainFrom || !trainTo) {
    return { attendance: [], retentionM3: [], truncated: false }
  }

  const modeIds = await fetchClubTrainerModeIds(supabaseAdmin, clubId)

  const [trainingsRes, clientsRes, membershipsRes, typesRes, lifecycleRes] = await Promise.all([
    fetchPagedLimited(supabaseAdmin, {
      table: 'trainings',
      select: 'id, trainer_id, client_id, date, status',
      clubId,
      dateFrom: trainFrom,
      dateTo: trainTo,
      maxRows: CLUB_STATS_MAX_TRAININGS,
    }),
    fetchPagedLimited(supabaseAdmin, {
      table: 'clients',
      select: CLIENT_SELECT,
      clubId,
      maxRows: CLUB_STATS_MAX_CLIENTS,
    }),
    fetchPagedLimited(supabaseAdmin, {
      table: 'memberships',
      select: MEMBERSHIP_SELECT,
      clubId,
      maxRows: CLUB_STATS_MAX_MEMBERSHIPS,
    }),
    fetchPagedLimited(supabaseAdmin, {
      table: 'membership_types',
      select: MEMBERSHIP_TYPES_SELECT,
      clubId,
      maxRows: 5000,
    }).catch(() => ({ rows: [], truncated: false })),
    fetchPagedLimited(supabaseAdmin, {
      table: 'client_hall_lifecycle',
      select: LIFECYCLE_SELECT,
      clubId,
      maxRows: CLUB_STATS_MAX_CLIENT_HALL_LIFECYCLE,
    }).catch(() => ({ rows: [], truncated: false })),
  ])

  let clients = clientsRes.rows ?? []
  let trainings = trainingsRes.rows ?? []
  if (trainerIdFilter) {
    clients = clients.filter((c) => String(c?.trainer_id ?? '') === trainerIdFilter)
    const allowed = new Set(clients.map((c) => String(c?.id ?? '')).filter(Boolean))
    trainings = trainings.filter((t) => allowed.has(String(t?.client_id ?? '')))
  }

  let lifecycleRows = lifecycleRes?.rows ?? []
  if (trainerIdFilter) {
    const allowed = new Set(clients.map((c) => String(c?.id ?? '')))
    lifecycleRows = lifecycleRows.filter((r) => allowed.has(String(r?.client_id ?? '')))
  }

  const truncated =
    trainingsRes.truncated ||
    clientsRes.truncated ||
    membershipsRes.truncated ||
    Boolean(typesRes?.truncated) ||
    Boolean(lifecycleRes?.truncated)

  const common = {
    clients,
    memberships: membershipsRes.rows ?? [],
    trainings,
    membershipTypes: typesRes.rows ?? [],
    lifecycleRows,
    holdingTrainerIds: modeIds.holdingTrainerIds,
    noTabletTrainerIds: modeIds.noTabletTrainerIds,
    year,
    todayIso,
    trainerIdFilter,
  }

  return {
    attendance: aggregateMonthlyAttendanceSeries(common),
    retentionM3: aggregateMonthlyRetentionM3Series(common),
    truncated,
  }
}
