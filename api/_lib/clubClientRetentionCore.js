/**
 * Сборка clientRetention для admin-data?action=client-retention.
 */

import { aggregateClientRetention } from '../../src/lib/admin/clientRetentionAgg.js'
import {
  resolveRetentionCohortMonths,
  resolveRetentionTrainingBounds,
} from '../../src/lib/admin/clientRetentionCohortCore.js'
import { fetchClubTrainerModeIds } from './clubTrainerModeIds.js'
import { fetchClientRestoreEventsForRetention } from './clientRestoreEventsQuery.js'
import { fetchPagedLimited } from './fetchPagedLimited.js'
import {
  CLUB_STATS_MAX_CLIENTS,
  CLUB_STATS_MAX_MEMBERSHIPS,
  CLUB_STATS_MAX_TRAININGS,
  CLUB_STATS_MAX_CLIENT_HALL_LIFECYCLE,
} from './apiLimits.js'

const LIFECYCLE_SELECT =
  'id, client_id, club_id, hall, closed_at, close_reason, close_reason_at, expected_return_on, updated_at'

const CLIENT_RETENTION_SELECT =
  'id, name, phone, archived_at, archive_reason, trainer_id, lifecycle, pnk_stage, pnk_won_at, desk_hall'

const MEMBERSHIP_TYPES_SELECT =
  'id, code, sort_order, is_active, is_pnk_trial, trainer_assignable'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{
 *   clubId: string,
 *   dateFrom: string,
 *   dateTo: string,
 *   trainerIdFilter?: string | null,
 *   restoreEvents?: Array<{ clientId: string, restoredAt: string }>,
 * }} opts
 */
export async function buildClubClientRetentionPayload(supabaseAdmin, opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const dateFrom = String(opts.dateFrom ?? '').slice(0, 10)
  const dateTo = String(opts.dateTo ?? '').slice(0, 10)
  const trainerIdFilter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : null

  if (!clubId || !dateFrom || !dateTo) {
    return { clientRetention: null, truncated: false }
  }

  const cohortMonths = resolveRetentionCohortMonths(dateTo, 6)
  const { trainFrom, trainTo } = resolveRetentionTrainingBounds(cohortMonths, 3)
  const trainingFrom = trainFrom && trainFrom < dateFrom ? trainFrom : dateFrom
  const trainingTo = trainTo && trainTo > dateTo ? trainTo : dateTo

  const modeIds = await fetchClubTrainerModeIds(supabaseAdmin, clubId)

  const [trainingsRes, clientsRes, membershipsRes, typesRes, lifecycleRes] = await Promise.all([
    fetchPagedLimited(supabaseAdmin, {
      table: 'trainings',
      select: 'id, trainer_id, client_id, date, status',
      clubId,
      dateFrom: trainingFrom,
      dateTo: trainingTo,
      maxRows: CLUB_STATS_MAX_TRAININGS,
    }),
    fetchPagedLimited(supabaseAdmin, {
      table: 'clients',
      select: CLIENT_RETENTION_SELECT,
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
    }),
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
    trainings = trainings.filter((t) => String(t?.trainer_id ?? '') === trainerIdFilter)
  }

  const truncated =
    trainingsRes.truncated ||
    clientsRes.truncated ||
    membershipsRes.truncated ||
    typesRes.truncated ||
    Boolean(lifecycleRes?.truncated)

  const restoreEvents =
    opts.restoreEvents ??
    (await fetchClientRestoreEventsForRetention(supabaseAdmin, {
      clubId,
      asOf: dateTo,
      trainerIdFilter,
    }))

  let lifecycleRows = lifecycleRes?.rows ?? []
  if (trainerIdFilter) {
    const allowed = new Set(clients.map((c) => String(c?.id ?? '')))
    lifecycleRows = lifecycleRows.filter((r) => allowed.has(String(r?.client_id ?? '')))
  }

  const agg = aggregateClientRetention({
    clients,
    memberships: membershipsRes.rows ?? [],
    trainings,
    membershipTypes: typesRes.rows ?? [],
    periodFrom: dateFrom,
    periodTo: dateTo,
    asOf: dateTo,
    cohortMonths,
    restoreEvents,
    lifecycleRows,
    holdingTrainerIds: modeIds.holdingTrainerIds,
    noTabletTrainerIds: modeIds.noTabletTrainerIds,
  })

  let byTrainer = agg.byTrainer ?? {}
  if (trainerIdFilter) {
    byTrainer = byTrainer[trainerIdFilter] ? { [trainerIdFilter]: byTrainer[trainerIdFilter] } : {}
  }

  return {
    clientRetention: {
      ...agg,
      byTrainer,
      truncated,
      restoreEventsAvailable: restoreEvents.length > 0,
    },
  }
}
