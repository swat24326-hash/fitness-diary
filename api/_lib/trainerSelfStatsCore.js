/**
 * Сводка ЗП + статистики тренера на сервере (service role).
 * Лёгкий select (без полного JSONB data) — успевать на планшетном Wi‑Fi / cold start.
 */

import { aggregateTrainings, aggregateClubClientPeriod } from './clubStatsAgg.js'
import { aggregateMembershipTypeStats } from './membershipTypeStatsAgg.js'
import { CLUB_STATS_MAX_TRAININGS, CLUB_STATS_MAX_CLIENTS, CLUB_STATS_MAX_MEMBERSHIPS } from './apiLimits.js'
import {
  buildTrainerPayRateMap,
  computePayrollFromMembershipStats,
} from '../../src/lib/admin/trainerPayrollCore.js'
import { normalizeTrainingRowForPayroll } from './trainerSelfStatsNormalize.js'

export { normalizeTrainingRowForPayroll } from './trainerSelfStatsNormalize.js'

/** Только нужное для ЗП: membership_id из JSONB без тяжёлого data. */
const TRAININGS_SELECT =
  'id, trainer_id, client_id, club_id, date, status, membership_id:data->>membership_id'
const CLIENTS_SELECT = 'id, trainer_id, archived_at, lifecycle, club_id'
const MEM_SELECT =
  'id, client_id, club_id, start_date, end_date, total_trainings, used_trainings, membership_type_id'
const TYPES_SELECT =
  'id, code, sort_order, is_active, is_pnk_trial, trainer_assignable, trainer_pay_per_session, aerobic_pay_amount'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{ trainerId: string, clubId: string, dateFrom: string, dateTo: string, dayIso: string }} p
 */
export async function buildTrainerSelfStatsPayload(supabaseAdmin, p) {
  const trainerId = String(p.trainerId ?? '').trim()
  const clubId = String(p.clubId ?? '').trim()
  const dateFrom = String(p.dateFrom ?? '').slice(0, 10)
  const dateTo = String(p.dateTo ?? '').slice(0, 10)
  const dayIso = String(p.dayIso ?? dateTo).slice(0, 10)

  if (!trainerId || !clubId || !dateFrom || !dateTo || dateFrom > dateTo) {
    throw new Error('bad_range')
  }

  const loadFrom = dayIso < dateFrom ? dayIso : dateFrom
  const loadTo = dayIso > dateTo ? dayIso : dateTo

  const [trainingsRes, clientsRes, typesRes] = await Promise.all([
    fetchTrainerTrainingsPaged(supabaseAdmin, {
      trainerId,
      clubId,
      dateFrom: loadFrom,
      dateTo: loadTo,
      maxRows: CLUB_STATS_MAX_TRAININGS,
    }),
    fetchTrainerClientsPaged(supabaseAdmin, { trainerId, clubId, maxRows: CLUB_STATS_MAX_CLIENTS }),
    supabaseAdmin
      .from('membership_types')
      .select(TYPES_SELECT)
      .eq('club_id', clubId)
      .order('sort_order', { ascending: true }),
  ])

  if (typesRes.error) throw typesRes.error

  const trainings = trainingsRes.rows.map(normalizeTrainingRowForPayroll)
  const clients = clientsRes.rows
  const membershipTypes = Array.isArray(typesRes.data) ? typesRes.data : []
  const clientIds = clients.map((c) => String(c.id)).filter(Boolean)

  const memberships = await fetchMembershipsForClientIds(
    supabaseAdmin,
    clubId,
    clientIds,
    CLUB_STATS_MAX_MEMBERSHIPS,
  )

  const periodTrainings = trainings.filter((t) => {
    const d = String(t.date ?? '').slice(0, 10)
    return d && d >= dateFrom && d <= dateTo
  })

  const trainingAgg = aggregateTrainings(periodTrainings)
  const clientAgg = aggregateClubClientPeriod(clients, memberships.rows, dateFrom, dateTo)
  const membershipRows = memberships.rows

  const typeStats = aggregateMembershipTypeStats({
    trainings: periodTrainings,
    memberships: membershipRows,
    membershipTypes,
    trainerIdFilter: trainerId,
  })

  const rateMap = buildTrainerPayRateMap(membershipTypes)
  const monthPay = computePayrollFromMembershipStats(typeStats, rateMap, {
    trainerIdFilter: trainerId,
  }).clubTotal

  const dayTrainings = trainings.filter((t) => {
    const d = String(t.date ?? '').slice(0, 10)
    return d === dayIso && t.status === 'completed'
  })
  const dayTypeStats = aggregateMembershipTypeStats({
    trainings: dayTrainings,
    memberships: membershipRows,
    membershipTypes,
    trainerIdFilter: trainerId,
  })
  const dayPay = computePayrollFromMembershipStats(dayTypeStats, rateMap, {
    trainerIdFilter: trainerId,
  }).clubTotal

  return {
    source: 'api',
    truncated: Boolean(trainingsRes.truncated || clientsRes.truncated || memberships.truncated),
    dayIso,
    dateFrom,
    dateTo,
    payroll: {
      dayPay,
      monthPay,
    },
    period: {
      ...trainingAgg,
      ...clientAgg,
      byType: typeStats.byType,
      byTrainerByType: typeStats.byTrainerByType,
      totalCounted: typeStats.totalCounted,
      coachQuality: null,
      source: 'api',
      fallbackReason: null,
      error: null,
    },
  }
}

async function fetchTrainerTrainingsPaged(supabaseAdmin, { trainerId, clubId, dateFrom, dateTo, maxRows }) {
  const rows = []
  let from = 0
  let truncated = false
  const pageSize = 500
  const cap = maxRows

  for (;;) {
    if (rows.length >= cap) {
      truncated = true
      break
    }
    const room = cap - rows.length
    const limit = Math.min(pageSize, room)
    let q = supabaseAdmin
      .from('trainings')
      .select(TRAININGS_SELECT)
      .eq('club_id', clubId)
      .eq('trainer_id', trainerId)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('id', { ascending: true })
      .range(from, from + limit - 1)

    let { data, error } = await q
    // Фоллбэк, если PostgREST не принял data->membership_id
    if (error && /membership_id|could not find|column/i.test(String(error.message ?? ''))) {
      const fallback = await supabaseAdmin
        .from('trainings')
        .select('id, trainer_id, client_id, club_id, date, status, data')
        .eq('club_id', clubId)
        .eq('trainer_id', trainerId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('id', { ascending: true })
        .range(from, from + limit - 1)
      data = fallback.data
      error = fallback.error
    }
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < limit) break
    from += limit
  }
  return { rows, truncated }
}

async function fetchTrainerClientsPaged(supabaseAdmin, { trainerId, clubId, maxRows }) {
  const rows = []
  let from = 0
  let truncated = false
  const pageSize = 500

  for (;;) {
    if (rows.length >= maxRows) {
      truncated = true
      break
    }
    const room = maxRows - rows.length
    const limit = Math.min(pageSize, room)
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select(CLIENTS_SELECT)
      .eq('club_id', clubId)
      .eq('trainer_id', trainerId)
      .order('id', { ascending: true })
      .range(from, from + limit - 1)
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < limit) break
    from += limit
  }
  return { rows, truncated }
}

async function fetchMembershipsForClientIds(supabaseAdmin, clubId, clientIds, maxRows) {
  if (!clientIds.length) return { rows: [], truncated: false }

  const rows = []
  let truncated = false
  const chunkSize = 80
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    if (rows.length >= maxRows) {
      truncated = true
      break
    }
    const chunk = clientIds.slice(i, i + chunkSize)
    const room = maxRows - rows.length
    const { data, error } = await supabaseAdmin
      .from('memberships')
      .select(MEM_SELECT)
      .eq('club_id', clubId)
      .in('client_id', chunk)
      .order('id', { ascending: true })
      .limit(Math.min(500, room))
    if (error) throw error
    rows.push(...(data ?? []))
  }
  if (rows.length >= maxRows) truncated = true
  return { rows: rows.slice(0, maxRows), truncated }
}
