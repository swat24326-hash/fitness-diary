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
  SUPERVISOR_EXPENSE_SELECT_COLS,
} from './salesReportCore.js'
import {
  isMissingSalesColumnError,
  querySalesDailyRow,
  querySalesMonthRows,
  querySalesPlanRow,
  SALES_DAILY_SELECT_BASE,
  SALES_DAILY_SELECT_FULL,
  SALES_DAILY_SELECT_WITHOUT_PROMO,
  SALES_DAILY_SELECT_WITHOUT_REFUNDS,
  SALES_PLAN_SELECT_WITH_PROMOTIONS,
  SALES_PLAN_SELECT_WITH_SNAPSHOT,
  SALES_PLAN_SELECT_FULL,
} from './adminSalesQueryResilience.js'
import { patchOrInsertClubSalesPlanRow } from './salesPlanRowPersistCore.js'
import {
  normalizePromotionsFromDb,
  promoSalesFormToPayload,
  validateDayPromoSales,
  validatePromotionsForSave,
} from './salesPromotionsCore.js'
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
import { salesBundleProfileFlags } from './salesBundleProfileCore.js'

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
  // Сначала API (service role) — у менеджера прямой Supabase раньше не отдавал типы АЗ (нет RLS).
  try {
    const { fetchMembershipTypesForClubViaApi } = await import('./adminApiClient.js')
    const viaApi = await fetchMembershipTypesForClubViaApi(clubId)
    if ((viaApi?.membership_types ?? []).length) return viaApi.membership_types
  } catch (e) {
    warnings.push(`типы карт (API): ${humanizeNetworkError(e) || e?.message || 'ошибка'}`)
  }
  try {
    const typesRes = await withSupabaseRetry(() =>
      supabase
        .from('membership_types')
        .select('id, code, sort_order, is_active, trainer_assignable, trainer_pay_per_session, trainer_pay_l1, trainer_pay_l2, trainer_pay_l3, aerobic_pay_amount, counts_toward_pay_plan')
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

/** @param {{ clubId: string, reportDate: string, profile?: string, includeFitCity?: boolean }} p */
export async function fetchClubSalesBundleViaSupabase({ clubId, reportDate, profile, includeFitCity }) {
  const cid = String(clubId ?? '').trim()
  const date = String(reportDate ?? '').slice(0, 10)
  const parts = monthPartsFromIso(date)
  if (!cid || !parts) throw new Error('Укажите клуб и дату')

  const flags = salesBundleProfileFlags(profile, includeFitCity)
  const { year, month } = parts
  const { start, end } = monthDateRange(year, month)
  const warnings = []

  let membershipTypes = []
  if (flags.needTypes) {
    membershipTypes = await loadMembershipTypes(cid, warnings)
  }

  let trainers = []
  if (flags.needTrainers) {
    try {
      trainers = await fetchClubTrainers(cid)
    } catch (e) {
      warnings.push(`тренеры: ${humanizeNetworkError(e) || e?.message || 'ошибка'}`)
    }
  }

  let daily = null
  let monthRows = []
  let plan = null
  let expense = null
  let salesTablesOk = true

  try {
    if (flags.needDaily) {
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
    }

    if (salesTablesOk && flags.needMonth) {
      const monthRes = await withSupabaseRetry(() => querySalesMonthRows(supabase, cid, start, end))
      if (monthRes.error) throw monthRes.error
      monthRows = monthRes.data ?? []
    }

    if (salesTablesOk && flags.needPlanExpense) {
      const planRes = await withSupabaseRetry(() => querySalesPlanRow(supabase, cid, year, month))
      if (planRes.error) throw planRes.error
      plan = planRes.data ?? null

      const expenseRes = await withSupabaseRetry(() =>
        supabase
          .from('club_supervisor_expense')
          .select(SUPERVISOR_EXPENSE_SELECT_COLS)
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

  const monthSummary = flags.needMonth ? aggregateMonthFromDailyRows(monthRows) : null
  if (monthSummary) {
    const expenseAmount = Number(expense?.amount) || 0
    const aerobicTypes = filterAerobicSalesTypes(membershipTypes)
    const aerobicRateMap = buildAerobicPayRateMap(aerobicTypes)
    const { loadTrainerPayrollContextClient } = await import('./trainerPayrollContextClient.js')
    const payrollCtx = await loadTrainerPayrollContextClient(cid, { year, month })
    const payTypes =
      payrollCtx.frozen && Array.isArray(payrollCtx.membershipTypes) && payrollCtx.membershipTypes.length
        ? payrollCtx.membershipTypes
        : membershipTypes
    const monthPayroll = aggregatePayrollFromDailyRows(monthRows, buildTrainerPayRateMap(payTypes), {
      membershipTypes: payTypes,
      planConfig: payrollCtx.planConfig,
      profilesByTrainerId: payrollCtx.profilesByTrainerId,
      clubId: cid,
    })
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
  }

  let fitCityTypeStats = null
  if (flags.needFitCity) {
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
    daily: flags.needDaily ? daily : null,
    monthRows: flags.includeMonthDays ? monthRows : [],
    plan: flags.needPlanExpense ? plan : null,
    expense: flags.needPlanExpense ? expense : null,
    monthSummary,
    membershipTypes: flags.needTypes ? membershipTypes : [],
    trainers: flags.needTrainers ? trainers : [],
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
  promoSales,
  promotions,
}) {
  const parsed = dailyFormToPayload(form, {
    matrixInput: trainingsMatrixInput,
    trainerIds,
    membershipTypes,
    aerobicMatrixInput,
    aerobicMembershipTypes,
  })
  if (!parsed.ok) throw new Error(parsed.error)

  /** @type {Record<string, unknown>} */
  const payload = { ...parsed.payload }
  if (promoSales != null) {
    const promoParsed = promoSalesFormToPayload(promoSales)
    if (!promoParsed.ok) throw new Error(promoParsed.error)
    const check = validateDayPromoSales({
      promo_sales: promoParsed.promo_sales,
      promotions: normalizePromotionsFromDb(promotions),
      matrixCounts: Object.fromEntries(
        Object.entries(payload).filter(([k]) => /^(pz|tz|az|dop)_(nk|dk|uk)$/.test(k)),
      ),
    })
    if (!check.ok) throw new Error(check.error)
    payload.promo_sales = promoParsed.promo_sales
  }

  const row = {
    club_id: clubId,
    report_date: reportDate,
    ...payload,
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
    if (payload.promo_sales != null && Object.keys(payload.promo_sales).length > 0) {
      throw new Error(
        'Нет колонки promo_sales — примените миграцию: npm run db:migrate:sales-promotions -- --linked',
      )
    }
    const { promo_sales: _promo, ...rowWithoutPromo } = row
    void _promo
    res = await withSupabaseRetry(() =>
      supabase
        .from('club_sales_daily')
        .upsert(rowWithoutPromo, { onConflict: 'club_id,report_date' })
        .select(SALES_DAILY_SELECT_WITHOUT_PROMO)
        .single(),
    )
  }
  if (res.error && isMissingSalesColumnError(res.error)) {
    const { refunds_amount: _refunds, promo_sales: _promo2, ...rowWithoutRefunds } = row
    void _refunds
    void _promo2
    res = await withSupabaseRetry(() =>
      supabase
        .from('club_sales_daily')
        .upsert(rowWithoutRefunds, { onConflict: 'club_id,report_date' })
        .select(SALES_DAILY_SELECT_WITHOUT_REFUNDS)
        .single(),
    )
  }
  if (res.error && isMissingSalesColumnError(res.error)) {
    const { matrix_amounts: _drop, refunds_amount: _refunds2, promo_sales: _promo3, ...rowWithoutAmounts } =
      row
    void _drop
    void _refunds2
    void _promo3
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

export async function saveClubSalesPlanViaSupabase({ clubId, year, month, form, scope, promotions }) {
  if (scope === 'promotions') {
    const validated = validatePromotionsForSave(promotions ?? [])
    if (!validated.ok) throw new Error(validated.error)
    const { data, error } = await withSupabaseRetry(() =>
      patchOrInsertClubSalesPlanRow(supabase, {
        clubId,
        year,
        month,
        patch: { promotions: validated.promotions, updated_at: new Date().toISOString() },
        selectCols: SALES_PLAN_SELECT_WITH_PROMOTIONS,
      }),
    )
    if (error) {
      if (isMissingTableError(error)) throw new Error(MIGRATION_HINT)
      if (isMissingSalesColumnError(error) || /promotions/i.test(String(error.message ?? ''))) {
        throw new Error(
          'Нет колонки promotions — примените миграцию: npm run db:migrate:sales-promotions -- --linked',
        )
      }
      throw error
    }
    return data
  }

  const parsed = planFormToPayload(form, { scope })
  if (!parsed.ok) throw new Error(parsed.error)
  const selectCols = SALES_PLAN_SELECT_WITH_PROMOTIONS
  let { data, error } = await withSupabaseRetry(() =>
    patchOrInsertClubSalesPlanRow(supabase, {
      clubId,
      year,
      month,
      patch: { ...parsed.payload, updated_at: new Date().toISOString() },
      selectCols,
    }),
  )
  if (error && isMissingSalesColumnError(error)) {
    const retry = await withSupabaseRetry(() =>
      patchOrInsertClubSalesPlanRow(supabase, {
        clubId,
        year,
        month,
        patch: { ...parsed.payload, updated_at: new Date().toISOString() },
        selectCols: SALES_PLAN_SELECT_WITH_SNAPSHOT,
      }),
    )
    data = retry.data
    error = retry.error
  }
  if (error && isMissingSalesColumnError(error)) {
    const retry = await withSupabaseRetry(() =>
      patchOrInsertClubSalesPlanRow(supabase, {
        clubId,
        year,
        month,
        patch: { ...parsed.payload, updated_at: new Date().toISOString() },
        selectCols: SALES_PLAN_SELECT_FULL,
      }),
    )
    data = retry.data
    error = retry.error
  }
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
      .select(SUPERVISOR_EXPENSE_SELECT_COLS)
      .single(),
  )
  if (error) {
    if (isMissingTableError(error)) throw new Error(MIGRATION_HINT)
    throw error
  }
  return data
}
