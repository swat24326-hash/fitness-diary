import { aggregateTrainings, aggregateClubClientPeriod } from './clubStatsAgg.js'
import { aggregateMembershipTypeStats } from './membershipTypeStatsAgg.js'
import { fetchClubStatsRaw } from './clubStatsFetch.js'
import { monthDateRange } from '../../src/lib/admin/salesReportCore.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
} from '../../src/lib/admin/trainerPayrollCore.js'
import {
  loadTrainerPayrollContext,
  payrollOptsFromContext,
} from './trainerPayrollContext.js'
import {
  aggregateAerobicPayrollFromDailyRows,
  buildAerobicPayRateMap,
} from '../../src/lib/admin/aerobicPayrollCore.js'
import { filterAerobicSalesTypes } from '../../src/lib/membershipTypesCore.js'
import { buildGeminiSnapshot, previousMonthParts } from '../../src/lib/admin/geminiAnalyticsSnapshot.js'
import { applyMonthComparisonInsights } from '../../src/lib/admin/clubMonthAnalyticsCore.js'
import {
  buildGeminiTrainerContour,
  collectClubTrainerDirectory,
} from '../../src/lib/admin/geminiTrainerContour.js'
import { getCachedGeminiSnapshot, setCachedGeminiSnapshot } from './geminiAnalyticsCache.js'
import { collectHoldingTrainerIds } from '../../src/lib/admin/holdingClientsCore.js'
import { collectNoTabletTrainerIds } from '../../src/lib/admin/trainerTabletModeCore.js'

const SALES_MONTH_SELECT =
  'report_date, profit_nk, profit_dk, profit_uk, profit_day, refunds_amount, pnk_total, trainings_count, trainings_matrix, aerobic_sales_matrix, matrix_amounts, pz_nk, pz_dk, pz_uk, tz_nk, tz_dk, tz_uk, az_nk, az_dk, az_uk, dop_nk, dop_dk, dop_uk'

async function loadMonthRaw(supabaseAdmin, clubId, year, month) {
  const { start, end } = monthDateRange(year, month)
  const membershipTypesSelect =
    'id, code, trainer_assignable, trainer_pay_per_session, trainer_pay_l1, trainer_pay_l2, trainer_pay_l3, aerobic_pay_amount'
  const [monthRes, planRes, expenseRes, clubStatsRaw, usersRes] = await Promise.all([
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
    fetchClubStatsRaw(supabaseAdmin, {
      clubId,
      dateFrom: start,
      dateTo: end,
      membershipTypesSelect,
    }),
    supabaseAdmin.from('users').select('id, name, role, uses_tablet').eq('club_id', clubId),
  ])

  let usersErr = usersRes.error
  let usersRows = usersRes.data ?? []
  if (usersErr && String(usersErr.message ?? '').toLowerCase().includes('uses_tablet')) {
    const retry = await supabaseAdmin.from('users').select('id, name, role').eq('club_id', clubId)
    usersErr = retry.error
    usersRows = (retry.data ?? []).map((u) => ({ ...u, uses_tablet: true }))
  }

  const err = monthRes.error || planRes.error || expenseRes.error || usersErr
  if (err) throw err

  const trainings = clubStatsRaw.trainings
  const clients = clubStatsRaw.clients
  const memberships = clubStatsRaw.memberships
  const statsTruncated = clubStatsRaw.truncated

  const monthRows = monthRes.data ?? []
  const membershipTypes = clubStatsRaw.membershipTypes
  const aerobicTypes = filterAerobicSalesTypes(membershipTypes)
  const payRateMap = buildTrainerPayRateMap(membershipTypes)
  const aerobicRateMap = buildAerobicPayRateMap(aerobicTypes)
  const payrollCtx = await loadTrainerPayrollContext(supabaseAdmin, clubId)
  const payroll = aggregatePayrollFromDailyRows(
    monthRows,
    payRateMap,
    payrollOptsFromContext(payrollCtx, membershipTypes),
  )
  const aerobicPayroll = aggregateAerobicPayrollFromDailyRows(monthRows, aerobicRateMap)
  const trainingAgg = aggregateTrainings(trainings)
  const users = usersRows
  const holdingTrainerIds = collectHoldingTrainerIds(users)
  const noTabletTrainerIds = collectNoTabletTrainerIds(users)
  const clientPeriod = aggregateClubClientPeriod(clients, memberships, start, end, undefined, {
    holdingTrainerIds,
    noTabletTrainerIds,
  })
  const typeStats = aggregateMembershipTypeStats({ trainings, memberships, membershipTypes })
  const fitCityCompleted = typeStats?.totalCounted ?? trainingAgg.totalCompleted

  return {
    monthRows,
    plan: planRes.data,
    expenseAmount: Number(expenseRes.data?.amount) || 0,
    payrollClubTotal: payroll.clubTotal,
    aerobicPayrollClubTotal: aerobicPayroll.clubTotal,
    planConfig: payrollCtx.planConfig,
    profilesByTrainerId: payrollCtx.profilesByTrainerId,
    clubId,
    trainingAgg,
    inactiveInPeriod: clientPeriod.inactiveInPeriod ?? 0,
    fitCityCompleted,
    membershipTypes,
    users,
    clients,
    trainings,
    memberships,
    dateFrom: start,
    dateTo: end,
    stats_truncated: statsTruncated,
    holdingTrainerIds,
    noTabletTrainerIds,
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
    planConfig: raw.planConfig,
    profilesByTrainerId: raw.profilesByTrainerId,
    clubId,
  })

  const trainers = collectClubTrainerDirectory(raw.users, raw.clients)
  snapshot.trainer_contour = buildGeminiTrainerContour({
    trainers,
    clients: raw.clients,
    trainings: raw.trainings,
    memberships: raw.memberships,
    membershipTypes: raw.membershipTypes,
    dateFrom: raw.dateFrom,
    dateTo: raw.dateTo,
    year,
    selectedTrainerId: null,
    holdingTrainerIds: raw.holdingTrainerIds,
    noTabletTrainerIds: raw.noTabletTrainerIds,
  })

  setCachedGeminiSnapshot(clubId, year, month, snapshot, includeFinance)
  return snapshot
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @param {number} year
 * @param {number} month
 * @param {{ comparePrevious?: boolean, includePreviousMonth?: boolean, includeFinance?: boolean, clubName?: string }} opts
 */
export async function loadGeminiAnalyticsContext(supabaseAdmin, clubId, year, month, opts = {}) {
  const snapshot = await loadGeminiSnapshotForMonth(supabaseAdmin, clubId, year, month, opts)
  let previousSnapshot = null
  const wantPrev =
    opts.comparePrevious === true ||
    opts.includePreviousMonth === true
  if (wantPrev) {
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
