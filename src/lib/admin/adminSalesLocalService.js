/**
 * Загрузка/сохранение отчётов продаж через Supabase (fallback когда /api недоступен).
 */
import { supabase } from '../supabase.js'
import { withSupabaseRetry } from '../supabaseRetry.js'
import { USERS_TRAINER_ROLES } from '../userRoleConstants.js'
import { ADMIN_SYNC_BATCH_SIZE } from './adminConstants.js'
import { aggregateMembershipTypeStats } from './membershipTypeStatsAgg.js'
import {
  aggregateMonthFromDailyRows,
  dailyFormToPayload,
  expenseFormToPayload,
  monthDateRange,
  monthPartsFromIso,
  planFormToPayload,
} from './salesReportCore.js'
import { normalizeMatrixRowsFromDb } from './salesTrainingsMatrix.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
  computeNetProfitWithPayroll,
} from './trainerPayrollCore.js'

const SALES_DAILY_SELECT_FULL =
  'id, club_id, report_date, profit_nk, profit_dk, profit_uk, profit_day, pnk_total, trainings_count, trainings_matrix, matrix_amounts, pz_nk, pz_dk, pz_uk, tz_nk, tz_dk, tz_uk, az_nk, az_dk, az_uk, updated_at'

const SALES_DAILY_SELECT_BASE =
  'id, club_id, report_date, profit_nk, profit_dk, profit_uk, profit_day, pnk_total, trainings_count, trainings_matrix, pz_nk, pz_dk, pz_uk, tz_nk, tz_dk, tz_uk, az_nk, az_dk, az_uk, updated_at'

const MONTH_DAILY_SELECT =
  'report_date, profit_nk, profit_dk, profit_uk, profit_day, trainings_count, trainings_matrix'

function isMissingColumnError(err) {
  const m = String(err?.message ?? err ?? '').toLowerCase()
  return m.includes('matrix_amounts') || m.includes('does not exist') || m.includes('column')
}

async function querySalesDaily(select, clubId, reportDate) {
  const run = (cols) =>
    withSupabaseRetry(() =>
      supabase.from('club_sales_daily').select(cols).eq('club_id', clubId).eq('report_date', reportDate).maybeSingle(),
    )
  let res = await run(select)
  if (res.error && select.includes('matrix_amounts') && isMissingColumnError(res.error)) {
    res = await run(SALES_DAILY_SELECT_BASE)
  }
  return res
}

async function fetchPagedTrainings(clubId, dateFrom, dateTo) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from('trainings')
        .select('id, trainer_id, client_id, date, status, data')
        .eq('club_id', clubId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1),
    )
    if (error) throw error
    const chunk = data ?? []
    if (!chunk.length) break
    rows.push(...chunk)
    if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return rows
}

async function fetchPagedMemberships(clubId) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from('memberships')
        .select('id, client_id, membership_type_id')
        .eq('club_id', clubId)
        .order('id', { ascending: true })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1),
    )
    if (error) throw error
    const chunk = data ?? []
    if (!chunk.length) break
    rows.push(...chunk)
    if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return rows
}

async function fetchClubTrainers(clubId) {
  const { data, error } = await withSupabaseRetry(() =>
    supabase
      .from('users')
      .select('id, name, email, login, is_active, role, club_id')
      .eq('club_id', clubId)
      .order('name', { ascending: true }),
  )
  if (error) throw error
  const roles = new Set(USERS_TRAINER_ROLES.map((r) => r.toLowerCase()))
  return (data ?? []).filter((u) => {
    if (u?.is_active === false) return false
    return roles.has(String(u?.role ?? '').trim().toLowerCase())
  })
}

function mapBundle({
  clubId,
  reportDate,
  year,
  month,
  daily,
  monthRows,
  plan,
  expense,
  monthSummary,
  membershipTypes,
  trainers,
  fitCityTypeStats,
}) {
  return {
    clubId,
    year,
    month,
    reportDate,
    daily,
    monthDays: monthRows,
    plan,
    expense,
    monthSummary,
    membershipTypes,
    trainers,
    fitCityTypeStats,
    source: 'supabase',
  }
}

/** @param {{ clubId: string, reportDate: string }} p */
export async function fetchClubSalesBundleViaSupabase({ clubId, reportDate }) {
  const cid = String(clubId ?? '').trim()
  const date = String(reportDate ?? '').slice(0, 10)
  const parts = monthPartsFromIso(date)
  if (!cid || !parts) throw new Error('Укажите клуб и дату')

  const { year, month } = parts
  const { start, end } = monthDateRange(year, month)

  const [dailyRes, monthRes, planRes, expenseRes, typesRes, trainers, trainingsDay, memberships] =
    await Promise.all([
      querySalesDaily(SALES_DAILY_SELECT_FULL, cid, date),
      withSupabaseRetry(() =>
        supabase
          .from('club_sales_daily')
          .select(MONTH_DAILY_SELECT)
          .eq('club_id', cid)
          .gte('report_date', start)
          .lte('report_date', end)
          .order('report_date', { ascending: true }),
      ),
      withSupabaseRetry(() =>
        supabase
          .from('club_sales_plan')
          .select('plan_total, plan_pz, plan_tz, plan_az, updated_at')
          .eq('club_id', cid)
          .eq('year', year)
          .eq('month', month)
          .maybeSingle(),
      ),
      withSupabaseRetry(() =>
        supabase
          .from('club_supervisor_expense')
          .select('amount, updated_at')
          .eq('club_id', cid)
          .eq('year', year)
          .eq('month', month)
          .maybeSingle(),
      ),
      withSupabaseRetry(() =>
        supabase
          .from('membership_types')
          .select('id, code, sort_order, is_active, trainer_pay_per_session')
          .eq('club_id', cid)
          .order('sort_order', { ascending: true }),
      ),
      fetchClubTrainers(cid),
      fetchPagedTrainings(cid, date, date),
      fetchPagedMemberships(cid),
    ])

  const err =
    dailyRes.error || monthRes.error || planRes.error || expenseRes.error || typesRes.error
  if (err) throw err

  const monthRows = monthRes.data ?? []
  const monthSummary = aggregateMonthFromDailyRows(monthRows)
  const expenseAmount = Number(expenseRes.data?.amount) || 0
  const membershipTypes = typesRes.data ?? []
  const payRateMap = buildTrainerPayRateMap(membershipTypes)
  const monthPayroll = aggregatePayrollFromDailyRows(monthRows, payRateMap)
  monthSummary.expense = expenseAmount
  monthSummary.trainerPayroll = monthPayroll.clubTotal
  monthSummary.netProfit = computeNetProfitWithPayroll(
    monthSummary.profitTotal,
    monthPayroll.clubTotal,
    expenseAmount,
  )

  const fitCityTypeStats = aggregateMembershipTypeStats({
    trainings: trainingsDay,
    memberships,
    membershipTypes,
  })

  let daily = dailyRes.data ?? null
  if (daily?.trainings_matrix != null) {
    daily = { ...daily, trainings_matrix: normalizeMatrixRowsFromDb(daily.trainings_matrix) }
  }

  return mapBundle({
    clubId: cid,
    reportDate: date,
    year,
    month,
    daily,
    monthRows,
    plan: planRes.data ?? null,
    expense: expenseRes.data ?? null,
    monthSummary,
    membershipTypes,
    trainers,
    fitCityTypeStats,
  })
}

async function currentUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

/** @param {object} p */
export async function saveClubSalesDailyViaSupabase({
  clubId,
  reportDate,
  form,
  trainingsMatrixInput,
  trainerIds,
  membershipTypes,
}) {
  const parsed = dailyFormToPayload(form, {
    matrixInput: trainingsMatrixInput,
    trainerIds,
    membershipTypes,
  })
  if (!parsed.ok) throw new Error(parsed.error)

  const row = {
    club_id: clubId,
    report_date: reportDate,
    ...parsed.payload,
    updated_at: new Date().toISOString(),
    updated_by: await currentUserId(),
  }

  let res = await withSupabaseRetry(() =>
    supabase.from('club_sales_daily').upsert(row, { onConflict: 'club_id,report_date' }).select(SALES_DAILY_SELECT_FULL).single(),
  )
  if (res.error && isMissingColumnError(res.error)) {
    const { matrix_amounts: _drop, ...rowWithoutAmounts } = row
    void _drop
    res = await withSupabaseRetry(() =>
      supabase
        .from('club_sales_daily')
        .upsert(rowWithoutAmounts, { onConflict: 'club_id,report_date' })
        .select(SALES_DAILY_SELECT_BASE)
        .single(),
    )
  }
  if (res.error) throw res.error
  return res.data
}

export async function saveClubSalesPlanViaSupabase({ clubId, year, month, form }) {
  const parsed = planFormToPayload(form)
  if (!parsed.ok) throw new Error(parsed.error)
  const { data, error } = await withSupabaseRetry(() =>
    supabase
      .from('club_sales_plan')
      .upsert(
        { club_id: clubId, year, month, ...parsed.payload, updated_at: new Date().toISOString() },
        { onConflict: 'club_id,year,month' },
      )
      .select('plan_total, plan_pz, plan_tz, plan_az, updated_at')
      .single(),
  )
  if (error) throw error
  return data
}

export async function saveClubSalesFinanceViaSupabase({ clubId, year, month, form }) {
  const parsed = expenseFormToPayload(form)
  if (!parsed.ok) throw new Error(parsed.error)
  const { data, error } = await withSupabaseRetry(() =>
    supabase
      .from('club_supervisor_expense')
      .upsert(
        { club_id: clubId, year, month, ...parsed.payload, updated_at: new Date().toISOString() },
        { onConflict: 'club_id,year,month' },
      )
      .select('amount, updated_at')
      .single(),
  )
  if (error) throw error
  return data
}
