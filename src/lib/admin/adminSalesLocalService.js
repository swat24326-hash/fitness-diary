/**
 * Загрузка/сохранение отчётов продаж через Supabase (fallback когда /api недоступен).
 */
import { supabase } from '../supabase.js'
import { humanizeNetworkError, withSupabaseRetry } from '../supabaseRetry.js'
import { listMembershipTypesForClub } from '../membershipTypesService.js'
import { USERS_TRAINER_ROLES } from '../userRoleConstants.js'
import { ADMIN_SYNC_BATCH_SIZE } from './adminConstants.js'
import { aggregateMembershipTypeStats } from './membershipTypeStatsAgg.js'
import {
  aggregateMonthFromDailyRows,
  buildHallFinanceSummary,
  dailyFormToPayload,
  expenseFormToPayload,
  monthDateRange,
  monthPartsFromIso,
  planFormToPayload,
} from './salesReportCore.js'
import {
  isMissingSalesColumnError,
  querySalesDailyRow,
  querySalesMonthRows,
  querySalesPlanRow,
  SALES_DAILY_SELECT_BASE,
  SALES_DAILY_SELECT_FULL,
} from './adminSalesQueryResilience.js'
import { normalizeMatrixRowsFromDb } from './salesTrainingsMatrix.js'
import { normalizeAerobicRowsFromDb } from './aerobicSalesMatrix.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
  computeNetProfitWithPayroll,
} from './trainerPayrollCore.js'
import {
  aggregateAerobicPayrollFromDailyRows,
  buildAerobicPayRateMap,
} from './aerobicPayrollCore.js'
import { filterAerobicSalesTypes } from '../membershipTypesCore.js'

const MIGRATION_HINT =
  'Таблицы продаж (club_sales) не найдены в Supabase — выполните миграцию supabase/migrations/20260624120000_club_sales.sql в SQL Editor.'

function isMissingTableError(err) {
  const m = String(err?.message ?? err ?? '').toLowerCase()
  return (
    isMissingSalesColumnError(err) ||
    m.includes('schema cache') ||
    m.includes('relation') ||
    m.includes('42p01') ||
    m.includes('club_sales')
  )
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

async function loadMembershipTypes(clubId, warnings) {
  try {
    const typesRes = await withSupabaseRetry(() =>
      supabase
        .from('membership_types')
        .select('id, code, sort_order, is_active, trainer_assignable, trainer_pay_per_session, aerobic_pay_amount')
        .eq('club_id', clubId)
        .order('sort_order', { ascending: true }),
    )
    if (typesRes.error) throw typesRes.error
    if ((typesRes.data ?? []).length) return typesRes.data ?? []
  } catch (e) {
    warnings.push(`типы карт (облако): ${humanizeNetworkError(e) || e?.message || 'ошибка'}`)
  }
  return listMembershipTypesForClub(clubId)
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
  warnings = [],
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
    warnings,
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
  const warnings = []

  const membershipTypes = await loadMembershipTypes(cid, warnings)

  let trainers = []
  try {
    trainers = await fetchClubTrainers(cid)
  } catch (e) {
    warnings.push(`тренеры: ${humanizeNetworkError(e) || e?.message || 'ошибка'}`)
  }

  let daily = null
  let monthRows = []
  let plan = null
  let expense = null
  let salesTablesOk = true

  try {
    const dailyRes = await withSupabaseRetry(() => querySalesDailyRow(supabase, cid, date))
    if (dailyRes.error) {
      if (isMissingTableError(dailyRes.error)) {
        salesTablesOk = false
        warnings.push(MIGRATION_HINT)
      } else {
        throw dailyRes.error
      }
    } else {
      daily = dailyRes.data ?? null
    }

    if (salesTablesOk) {
      const monthRes = await withSupabaseRetry(() => querySalesMonthRows(supabase, cid, start, end))
      if (monthRes.error) throw monthRes.error
      monthRows = monthRes.data ?? []

      const planRes = await withSupabaseRetry(() => querySalesPlanRow(supabase, cid, year, month))
      if (planRes.error) throw planRes.error
      plan = planRes.data ?? null

      const expenseRes = await withSupabaseRetry(() =>
        supabase
          .from('club_supervisor_expense')
          .select('amount, updated_at')
          .eq('club_id', cid)
          .eq('year', year)
          .eq('month', month)
          .maybeSingle(),
      )
      if (expenseRes.error) throw expenseRes.error
      expense = expenseRes.data ?? null
    }
  } catch (e) {
    if (isMissingTableError(e)) {
      warnings.push(MIGRATION_HINT)
    } else {
      throw e
    }
  }

  const monthSummary = aggregateMonthFromDailyRows(monthRows)
  const expenseAmount = Number(expense?.amount) || 0
  const aerobicTypes = filterAerobicSalesTypes(membershipTypes)
  const payRateMap = buildTrainerPayRateMap(membershipTypes)
  const aerobicRateMap = buildAerobicPayRateMap(aerobicTypes)
  const monthPayroll = aggregatePayrollFromDailyRows(monthRows, payRateMap)
  const monthAerobicPayroll = aggregateAerobicPayrollFromDailyRows(monthRows, aerobicRateMap)
  monthSummary.expense = expenseAmount
  monthSummary.trainerPayroll = monthPayroll.clubTotal
  monthSummary.aerobicPayroll = monthAerobicPayroll.clubTotal
  monthSummary.netProfit = computeNetProfitWithPayroll(
    monthSummary.profitTotal,
    monthPayroll.clubTotal,
    expenseAmount,
    monthAerobicPayroll.clubTotal,
  )
  monthSummary.hallFinance = buildHallFinanceSummary(
    monthRows,
    monthPayroll.clubTotal,
    monthAerobicPayroll.clubTotal,
  )

  let fitCityTypeStats = null
  try {
    const [trainingsDay, memberships] = await Promise.all([
      fetchPagedTrainings(cid, date, date),
      fetchPagedMemberships(cid),
    ])
    fitCityTypeStats = aggregateMembershipTypeStats({
      trainings: trainingsDay,
      memberships,
      membershipTypes,
    })
  } catch {
    /* справка FIT-CITY необязательна */
  }

  if (daily?.trainings_matrix != null) {
    daily = { ...daily, trainings_matrix: normalizeMatrixRowsFromDb(daily.trainings_matrix) }
  }
  if (daily?.aerobic_sales_matrix != null) {
    daily = { ...daily, aerobic_sales_matrix: normalizeAerobicRowsFromDb(daily.aerobic_sales_matrix) }
  }

  if (!membershipTypes.length && !salesTablesOk && warnings.length) {
    throw new Error(warnings[0])
  }

  return mapBundle({
    clubId: cid,
    reportDate: date,
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
    warnings,
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
  aerobicMatrixInput,
  trainerIds,
  membershipTypes,
  aerobicMembershipTypes,
}) {
  const parsed = dailyFormToPayload(form, {
    matrixInput: trainingsMatrixInput,
    trainerIds,
    membershipTypes,
    aerobicMatrixInput,
    aerobicMembershipTypes,
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
  if (res.error && isMissingTableError(res.error)) {
    throw new Error(MIGRATION_HINT)
  }
  if (res.error && isMissingSalesColumnError(res.error)) {
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

export async function saveClubSalesPlanViaSupabase({ clubId, year, month, form, scope }) {
  const parsed = planFormToPayload(form, { scope })
  if (!parsed.ok) throw new Error(parsed.error)
  const { data, error } = await withSupabaseRetry(() =>
    supabase
      .from('club_sales_plan')
      .upsert(
        { club_id: clubId, year, month, ...parsed.payload, updated_at: new Date().toISOString() },
        { onConflict: 'club_id,year,month' },
      )
      .select('plan_total, plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az, plan_extra, updated_at')
      .single(),
  )
  if (error) {
    if (isMissingTableError(error)) throw new Error(MIGRATION_HINT)
    throw error
  }
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
  if (error) {
    if (isMissingTableError(error)) throw new Error(MIGRATION_HINT)
    throw error
  }
  return data
}
