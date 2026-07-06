import { aggregateTrainings, aggregateClubClientPeriod } from './clubStatsAgg.js'
import { aggregateMembershipTypeStats } from './membershipTypeStatsAgg.js'
import { monthDateRange } from '../../src/lib/admin/salesReportCore.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
} from '../../src/lib/admin/trainerPayrollCore.js'
import {
  aggregateAerobicPayrollFromDailyRows,
  buildAerobicPayRateMap,
} from '../../src/lib/admin/aerobicPayrollCore.js'
import { filterAerobicSalesTypes } from '../../src/lib/membershipTypesCore.js'
import { buildGeminiSnapshot, previousMonthParts } from '../../src/lib/admin/geminiAnalyticsSnapshot.js'
import { applyMonthComparisonInsights } from '../../src/lib/admin/clubMonthAnalyticsCore.js'
import { getCachedGeminiSnapshot, setCachedGeminiSnapshot } from './geminiAnalyticsCache.js'

const SALES_MONTH_SELECT =
  'report_date, profit_nk, profit_dk, profit_uk, profit_day, pnk_total, trainings_count, trainings_matrix, aerobic_sales_matrix, matrix_amounts, pz_nk, pz_dk, pz_uk, tz_nk, tz_dk, tz_uk, az_nk, az_dk, az_uk, dop_nk, dop_dk, dop_uk'

async function fetchPaged(supabaseAdmin, table, select, clubId, dateFrom, dateTo) {
  const PAGE = 400
  const rows = []
  let from = 0
  for (;;) {
    let q = supabaseAdmin.from(table).select(select).eq('club_id', clubId)
    if (table === 'trainings' && dateFrom && dateTo) {
      q = q.gte('date', dateFrom).lte('date', dateTo)
    }
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function loadMonthRaw(supabaseAdmin, clubId, year, month) {
  const { start, end } = monthDateRange(year, month)
  const [monthRes, planRes, expenseRes, typesRes, trainings, clients, memberships] = await Promise.all([
    supabaseAdmin
      .from('club_sales_daily')
      .select(SALES_MONTH_SELECT)
      .eq('club_id', clubId)
      .gte('report_date', start)
      .lte('report_date', end)
      .order('report_date', { ascending: true }),
    supabaseAdmin
      .from('club_sales_plan')
      .select('plan_total, plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az, plan_extra')
      .eq('club_id', clubId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabaseAdmin
      .from('club_supervisor_expense')
      .select('amount')
      .eq('club_id', clubId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabaseAdmin
      .from('membership_types')
      .select('id, code, trainer_assignable, trainer_pay_per_session, aerobic_pay_amount')
      .eq('club_id', clubId),
    fetchPaged(supabaseAdmin, 'trainings', 'id, trainer_id, client_id, date, status, data', clubId, start, end),
    fetchPaged(supabaseAdmin, 'clients', 'id, name, archived_at, trainer_id', clubId, null, null),
    fetchPaged(supabaseAdmin, 'memberships', 'id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id', clubId, null, null),
  ])

  const err = monthRes.error || planRes.error || expenseRes.error || typesRes.error
  if (err) throw err

  const monthRows = monthRes.data ?? []
  const membershipTypes = typesRes.data ?? []
  const aerobicTypes = filterAerobicSalesTypes(membershipTypes)
  const payRateMap = buildTrainerPayRateMap(membershipTypes)
  const aerobicRateMap = buildAerobicPayRateMap(aerobicTypes)
  const payroll = aggregatePayrollFromDailyRows(monthRows, payRateMap)
  const aerobicPayroll = aggregateAerobicPayrollFromDailyRows(monthRows, aerobicRateMap)
  const trainingAgg = aggregateTrainings(trainings)
  const clientPeriod = aggregateClubClientPeriod(clients, memberships, start, end)
  const typeStats = aggregateMembershipTypeStats({ trainings, memberships, membershipTypes })
  const fitCityCompleted = typeStats?.totalCounted ?? trainingAgg.totalCompleted

  return {
    monthRows,
    plan: planRes.data,
    expenseAmount: Number(expenseRes.data?.amount) || 0,
    payrollClubTotal: payroll.clubTotal,
    aerobicPayrollClubTotal: aerobicPayroll.clubTotal,
    trainingAgg,
    inactiveInPeriod: clientPeriod.inactiveInPeriod ?? 0,
    fitCityCompleted,
    membershipTypes: typesRes.data ?? [],
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 * @param {{ clubName?: string, includeFinance?: boolean }} opts
 */
export async function loadGeminiSnapshotForMonth(supabaseAdmin, clubId, year, month, opts = {}) {
  const includeFinance = opts.includeFinance !== false
  const cached = getCachedGeminiSnapshot(clubId, year, month, includeFinance)
  if (cached) return cached

  let clubName = String(opts.clubName ?? '').trim()
  if (!clubName) {
    const { data: club } = await supabaseAdmin.from('clubs').select('name').eq('id', clubId).maybeSingle()
    clubName = String(club?.name ?? '').trim() || 'клуб'
  }

  const raw = await loadMonthRaw(supabaseAdmin, clubId, year, month)
  const snapshot = buildGeminiSnapshot({
    clubName,
    year,
    month,
    monthRows: raw.monthRows,
    plan: raw.plan,
    expenseAmount: raw.expenseAmount,
    payrollClubTotal: raw.payrollClubTotal,
    aerobicPayrollClubTotal: raw.aerobicPayrollClubTotal,
    fitCityCompleted: raw.fitCityCompleted,
    inactiveInPeriod: raw.inactiveInPeriod,
    trainingCompleted: raw.trainingAgg.totalCompleted,
    trainingDraft: raw.trainingAgg.totalDraft,
    membershipTypes: raw.membershipTypes,
    includeFinance,
  })
  setCachedGeminiSnapshot(clubId, year, month, snapshot, includeFinance)
  return snapshot
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 * @param {{ comparePrevious?: boolean, includeFinance?: boolean, clubName?: string }} opts
 */
export async function loadGeminiAnalyticsContext(supabaseAdmin, clubId, year, month, opts = {}) {
  const snapshot = await loadGeminiSnapshotForMonth(supabaseAdmin, clubId, year, month, opts)
  let previousSnapshot = null
  if (opts.comparePrevious) {
    const prev = previousMonthParts(year, month)
    if (prev) {
      previousSnapshot = await loadGeminiSnapshotForMonth(supabaseAdmin, clubId, prev.year, prev.month, opts)
    }
  }
  if (previousSnapshot) {
    applyMonthComparisonInsights(snapshot, previousSnapshot)
  }
  return { snapshot, previousSnapshot, clubName: snapshot.club_name }
}
