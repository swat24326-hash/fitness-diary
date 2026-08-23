/**
 * Сборка clientAttendance для admin-data?action=client-attendance.
 */

import { addDaysToIso } from '../../src/lib/dateRu.js'
import { clampIsoDateToToday } from '../../src/lib/dateRu.js'
import { ATTENDANCE_GLANCE_WINDOW_DAYS } from '../../src/lib/clientAttendanceGlanceCore.js'
import { aggregateClubAttendance } from '../../src/lib/admin/clubAttendanceAggCore.js'
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

const CLIENT_SELECT = 'id, name, phone, archived_at, trainer_id, lifecycle, desk_hall'

const MEMBERSHIP_TYPES_SELECT =
  'id, code, sort_order, is_active, is_pnk_trial, trainer_assignable, counts_toward_pay_plan'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{
 *   clubId: string,
 *   dateFrom: string,
 *   dateTo: string,
 *   trainerIdFilter?: string | null,
 * }} opts
 */
export async function buildClubClientAttendancePayload(supabaseAdmin, opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const dateToRaw = String(opts.dateTo ?? '').slice(0, 10)
  const trainerIdFilter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : null

  if (!clubId || !/^\d{4}-\d{2}-\d{2}$/.test(dateToRaw)) {
    return { clientAttendance: null, truncated: false }
  }

  const dateTo = clampIsoDateToToday(dateToRaw)
  const periodFromRaw = String(opts.dateFrom ?? '').slice(0, 10)
  const windowFrom =
    /^\d{4}-\d{2}-\d{2}$/.test(periodFromRaw) && periodFromRaw <= dateTo
      ? periodFromRaw
      : addDaysToIso(dateTo, -(ATTENDANCE_GLANCE_WINDOW_DAYS - 1))
  // Lookback для last visit / slip: не короче 90 дн. и не короче окна периода + 14.
  const windowDays = Math.max(
    1,
    Math.round((new Date(`${dateTo}T12:00:00`) - new Date(`${windowFrom}T12:00:00`)) / 86400000) + 1,
  )
  const trainFrom = addDaysToIso(dateTo, -Math.max(90, windowDays + 14))

  const modeIds = await fetchClubTrainerModeIds(supabaseAdmin, clubId)

  const [trainingsRes, clientsRes, membershipsRes, typesRes, lifecycleRes] = await Promise.all([
    fetchPagedLimited(supabaseAdmin, {
      table: 'trainings',
      select: 'id, trainer_id, client_id, date, status',
      clubId,
      dateFrom: trainFrom,
      dateTo,
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
      select: 'id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id, hall',
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
    // Визиты считаем по client_id пула, не по trainer_id тренировки
    // (клиент мог ходить к другому тренеру — ритм всё равно его).
    const allowed = new Set(clients.map((c) => String(c?.id ?? '')).filter(Boolean))
    trainings = trainings.filter((t) => allowed.has(String(t?.client_id ?? '')))
  }

  const truncated =
    trainingsRes.truncated ||
    clientsRes.truncated ||
    membershipsRes.truncated ||
    Boolean(typesRes?.truncated) ||
    Boolean(lifecycleRes?.truncated)

  let lifecycleRows = lifecycleRes?.rows ?? []
  if (trainerIdFilter) {
    const allowed = new Set(clients.map((c) => String(c?.id ?? '')))
    lifecycleRows = lifecycleRows.filter((r) => allowed.has(String(r?.client_id ?? '')))
  }

  const clientAttendance = aggregateClubAttendance({
    clients,
    memberships: membershipsRes.rows ?? [],
    trainings,
    dateFrom: windowFrom,
    dateTo,
    trainerIdFilter,
    holdingTrainerIds: modeIds.holdingTrainerIds,
    noTabletTrainerIds: modeIds.noTabletTrainerIds,
    lifecycleRows,
    truncated,
    membershipTypes: typesRes?.rows ?? [],
  })

  const visitsDataMissing =
    clientAttendance.poolSize > 0 &&
    (clientAttendance.totalVisitsInWindow ?? 0) === 0 &&
    !trainings.length

  return {
    clientAttendance: {
      ...clientAttendance,
      periodFrom: windowFrom,
      periodTo: dateToRaw,
      windowFrom,
      visitsDataMissing,
    },
  }
}
