import { sendJson } from '../adminSupabase.js'
import { stripSalesBundleForManager } from '../../../src/lib/admin/salesAccessCore.js'
import { aggregateMembershipTypeStats } from '../membershipTypeStatsAgg.js'
import {
  aggregateMonthFromDailyRows,
  buildHallFinanceSummary,
  dailyFormToPayload,
  expenseFormToPayload,
  monthDateRange,
  monthPartsFromIso,
  planFormToPayload,
  SUPERVISOR_EXPENSE_SELECT_COLS,
} from '../../../src/lib/admin/salesReportCore.js'
import {
  querySalesDailyRow,
  querySalesMonthRows,
  querySalesPlanRow,
  SALES_DAILY_SELECT_BASE,
  SALES_DAILY_SELECT_FULL,
  SALES_DAILY_SELECT_WITHOUT_PROMO,
  SALES_DAILY_SELECT_WITHOUT_REFUNDS,
  SALES_PLAN_SELECT_FULL,
  SALES_PLAN_SELECT_WITH_PROMOTIONS,
  SALES_PLAN_SELECT_WITH_SNAPSHOT,
  isMissingSalesColumnError,
} from '../../../src/lib/admin/adminSalesQueryResilience.js'
import { validateStrategySnapshotForSave } from '../../../src/lib/admin/salesStrategySnapshotCore.js'
import {
  normalizePromotionsFromDb,
  promoSalesFormToPayload,
  validateDayPromoSales,
  validatePromotionsForSave,
} from '../../../src/lib/admin/salesPromotionsCore.js'
import { patchOrInsertClubSalesPlanRow } from '../../../src/lib/admin/salesPlanRowPersistCore.js'
import { normalizeMatrixRowsFromDb } from '../../../src/lib/admin/salesTrainingsMatrix.js'
import { normalizeAerobicRowsFromDb } from '../../../src/lib/admin/aerobicSalesMatrix.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
  computeNetProfitWithPayroll,
} from '../../../src/lib/admin/trainerPayrollCore.js'
import {
  aggregateAerobicPayrollFromDailyRows,
  buildAerobicPayRateMap,
} from '../../../src/lib/admin/aerobicPayrollCore.js'
import { filterAerobicSalesTypes } from '../../../src/lib/membershipTypesCore.js'
import { salesBundleProfileFlags } from '../../../src/lib/admin/salesBundleProfileCore.js'
import { TRAINER_ROLES } from './constants.js'
import { fetchPaged } from './paging.js'
import { isHoldingTrainerUser } from '../../../src/lib/admin/deskClosingImportCore.js'

const TRAINER_ROLES_SALES = new Set(TRAINER_ROLES)

export async function fetchClubTrainersForSales(supabaseAdmin, clubId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, login, phone, is_active, role, club_id, is_system_placeholder')
    .eq('club_id', clubId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).filter((u) => {
    if (u?.is_active === false) return false
    if (isHoldingTrainerUser(u)) return false
    return TRAINER_ROLES_SALES.has(String(u?.role ?? '').trim().toLowerCase())
  })
}

export function parseJsonBody(req) {
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return null
    }
  }
  return body && typeof body === 'object' ? body : null
}

export async function handleSalesGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const reportDate = String(req.query?.report_date ?? '').slice(0, 10)
  const parts = monthPartsFromIso(reportDate)
  if (!clubId || !parts) {
    sendJson(res, 400, { error: 'Укажите club_id и report_date (YYYY-MM-DD)' })
    return
  }
  const flags = salesBundleProfileFlags(req.query?.profile, req.query?.include_fit_city)
  const { year, month } = parts
  const { start, end } = monthDateRange(year, month)
  const { supabaseAdmin } = ctx

  const tasks = {
    daily: flags.needDaily
      ? querySalesDailyRow(supabaseAdmin, clubId, reportDate)
      : Promise.resolve({ data: null, error: null }),
    month: flags.needMonth
      ? querySalesMonthRows(supabaseAdmin, clubId, start, end)
      : Promise.resolve({ data: [], error: null }),
    plan: flags.needPlanExpense
      ? querySalesPlanRow(supabaseAdmin, clubId, year, month)
      : Promise.resolve({ data: null, error: null }),
    expense: flags.needPlanExpense
      ? supabaseAdmin
          .from('club_supervisor_expense')
          .select(SUPERVISOR_EXPENSE_SELECT_COLS)
          .eq('club_id', clubId)
          .eq('year', year)
          .eq('month', month)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    types: flags.needTypes
      ? supabaseAdmin
          .from('membership_types')
          .select('id, code, sort_order, is_active, trainer_assignable, trainer_pay_per_session, aerobic_pay_amount')
          .eq('club_id', clubId)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    trainers: flags.needTrainers
      ? fetchClubTrainersForSales(supabaseAdmin, clubId)
      : Promise.resolve([]),
    trainingsDay: flags.needFitCity
      ? fetchPaged(
          supabaseAdmin,
          'trainings',
          'id, trainer_id, client_id, date, status, data',
          clubId,
          reportDate,
          reportDate,
        )
      : Promise.resolve([]),
    memberships: flags.needFitCity
      ? fetchPaged(
          supabaseAdmin,
          'memberships',
          'id, client_id, membership_type_id',
          clubId,
          null,
          null,
        )
      : Promise.resolve([]),
  }

  const [dailyRes, monthRes, planRes, expenseRes, typesRes, trainers, trainingsDay, memberships] =
    await Promise.all([
      tasks.daily,
      tasks.month,
      tasks.plan,
      tasks.expense,
      tasks.types,
      tasks.trainers,
      tasks.trainingsDay,
      tasks.memberships,
    ])

  const err = dailyRes.error || monthRes.error || planRes.error || expenseRes.error || typesRes.error
  if (err) {
    sendJson(res, 400, { error: err.message })
    return
  }

  const monthRows = monthRes.data ?? []
  const monthSummary = aggregateMonthFromDailyRows(monthRows)
  const expenseAmount = Number(expenseRes.data?.amount) || 0
  const membershipTypes = typesRes.data ?? []
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
  if (flags.needFitCity) {
    fitCityTypeStats = aggregateMembershipTypeStats({
      trainings: trainingsDay,
      memberships,
      membershipTypes,
    })
  }

  let daily = dailyRes.data ?? null
  if (daily && daily.trainings_matrix != null) {
    daily.trainings_matrix = normalizeMatrixRowsFromDb(daily.trainings_matrix)
  }
  if (daily && daily.aerobic_sales_matrix != null) {
    daily.aerobic_sales_matrix = normalizeAerobicRowsFromDb(daily.aerobic_sales_matrix)
  }

  const payload = {
    club_id: clubId,
    year,
    month,
    report_date: reportDate,
    profile: flags.profile,
    daily: flags.needDaily ? daily : null,
    month_days: flags.includeMonthDays ? monthRows : [],
    plan: flags.needPlanExpense ? planRes.data ?? null : null,
    expense: flags.needPlanExpense ? expenseRes.data ?? null : null,
    month_summary: flags.needMonth ? monthSummary : null,
    membership_types: flags.needTypes ? membershipTypes : [],
    trainers: flags.needTrainers ? trainers : [],
    fit_city_type_stats: fitCityTypeStats,
  }

  sendJson(res, 200, stripSalesBundleForManager(payload, ctx.isSalesManager === true))
}

export async function handleSalesDailyPost(ctx, req, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  const reportDate = String(body?.report_date ?? '').slice(0, 10)
  if (!clubId || !reportDate) {
    sendJson(res, 400, { error: 'Укажите club_id и report_date' })
    return
  }
  const parsed = dailyFormToPayload(body?.form ?? body, {
    matrixInput: body?.trainings_matrix_input ?? null,
    trainerIds: Array.isArray(body?.trainer_ids) ? body.trainer_ids.map((x) => String(x)) : [],
    membershipTypes: Array.isArray(body?.membership_types) ? body.membership_types : [],
    aerobicMatrixInput: body?.aerobic_matrix_input ?? null,
    aerobicMembershipTypes: Array.isArray(body?.aerobic_membership_types)
      ? body.aerobic_membership_types
      : [],
  })
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  /** @type {Record<string, unknown>} */
  const payload = { ...parsed.payload }
  if (body?.promo_sales != null || body?.promoSales != null) {
    const promoParsed = promoSalesFormToPayload(body.promo_sales ?? body.promoSales)
    if (!promoParsed.ok) {
      sendJson(res, 400, { error: promoParsed.error })
      return
    }
    const promotions = normalizePromotionsFromDb(body?.promotions)
    const matrixCounts = {}
    for (const key of Object.keys(payload)) {
      if (/^(pz|tz|az|dop)_(nk|dk|uk)$/.test(key)) matrixCounts[key] = payload[key]
    }
    const check = validateDayPromoSales({
      promo_sales: promoParsed.promo_sales,
      promotions,
      matrixCounts,
    })
    if (!check.ok) {
      sendJson(res, 400, { error: check.error })
      return
    }
    payload.promo_sales = promoParsed.promo_sales
  }

  const { supabaseAdmin, user } = ctx
  const row = {
    club_id: clubId,
    report_date: reportDate,
    ...payload,
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  }
  let { data, error } = await supabaseAdmin
    .from('club_sales_daily')
    .upsert(row, { onConflict: 'club_id,report_date' })
    .select(SALES_DAILY_SELECT_FULL)
    .single()
  if (error && (isMissingSalesColumnError(error) || /promo_sales/i.test(String(error.message ?? '')))) {
    if (payload.promo_sales != null && Object.keys(payload.promo_sales).length > 0) {
      sendJson(res, 400, {
        error:
          'Нет колонки promo_sales — примените миграцию: npm run db:migrate:sales-promotions -- --linked',
      })
      return
    }
    const { promo_sales: _promo, ...rowWithoutPromo } = row
    void _promo
    const retry = await supabaseAdmin
      .from('club_sales_daily')
      .upsert(rowWithoutPromo, { onConflict: 'club_id,report_date' })
      .select(SALES_DAILY_SELECT_WITHOUT_PROMO)
      .single()
    data = retry.data
    error = retry.error
  }
  if (error) {
    const { refunds_amount: _refunds, promo_sales: _promo2, ...rowWithoutRefunds } = row
    void _refunds
    void _promo2
    const retry = await supabaseAdmin
      .from('club_sales_daily')
      .upsert(rowWithoutRefunds, { onConflict: 'club_id,report_date' })
      .select(SALES_DAILY_SELECT_WITHOUT_REFUNDS)
      .single()
    data = retry.data
    error = retry.error
  }
  if (error) {
    const { matrix_amounts: _drop, refunds_amount: _refunds2, promo_sales: _promo3, ...rowWithoutAmounts } =
      row
    void _drop
    void _refunds2
    void _promo3
    const retry = await supabaseAdmin
      .from('club_sales_daily')
      .upsert(rowWithoutAmounts, { onConflict: 'club_id,report_date' })
      .select(SALES_DAILY_SELECT_BASE)
      .single()
    data = retry.data
    error = retry.error
  }
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { daily: data })
}

export async function handleSalesPlanPost(ctx, req, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  const year = Number(body?.year)
  const month = Number(body?.month)
  if (!clubId || !Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    sendJson(res, 400, { error: 'Укажите club_id, year, month' })
    return
  }
  const scope =
    body?.scope === 'levels' ||
    body?.scope === 'directions' ||
    body?.scope === 'strategy_snapshot' ||
    body?.scope === 'promotions'
      ? body.scope
      : 'all'

  const { supabaseAdmin } = ctx
  const selectCols = SALES_PLAN_SELECT_WITH_PROMOTIONS

  if (scope === 'promotions') {
    const validated = validatePromotionsForSave(body?.promotions ?? [])
    if (!validated.ok) {
      sendJson(res, 400, { error: validated.error })
      return
    }
    let { data, error } = await patchOrInsertClubSalesPlanRow(supabaseAdmin, {
      clubId,
      year,
      month,
      patch: { promotions: validated.promotions, updated_at: new Date().toISOString() },
      selectCols,
    })
    if (
      error &&
      (isMissingSalesColumnError(error) || /promotions/i.test(String(error.message ?? '')))
    ) {
      sendJson(res, 400, {
        error:
          'Нет колонки promotions — примените миграцию: npm run db:migrate:sales-promotions -- --linked',
      })
      return
    }
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    sendJson(res, 200, { plan: data })
    return
  }

  if (scope === 'strategy_snapshot') {
    const snap = validateStrategySnapshotForSave(body?.strategy_snapshot ?? body?.snapshot)
    if (!snap.ok) {
      sendJson(res, 400, { error: snap.error })
      return
    }
    // Не upsert: частичное тело обнуляет уровни/матрицу плана.
    let { data, error } = await patchOrInsertClubSalesPlanRow(supabaseAdmin, {
      clubId,
      year,
      month,
      patch: { strategy_snapshot: snap.snapshot },
      selectCols: SALES_PLAN_SELECT_WITH_PROMOTIONS,
    })
    if (
      error &&
      (isMissingSalesColumnError(error) || /promotions/i.test(String(error.message ?? '')))
    ) {
      const retrySnap = await patchOrInsertClubSalesPlanRow(supabaseAdmin, {
        clubId,
        year,
        month,
        patch: { strategy_snapshot: snap.snapshot },
        selectCols: SALES_PLAN_SELECT_WITH_SNAPSHOT,
      })
      data = retrySnap.data
      error = retrySnap.error
    }
    if (
      error &&
      (isMissingSalesColumnError(error) || /strategy_snapshot/i.test(String(error.message ?? '')))
    ) {
      sendJson(res, 400, {
        error:
          'Нет колонки strategy_snapshot — примените миграцию: npm run db:migrate:strategy-snapshot -- --linked',
      })
      return
    }
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    sendJson(res, 200, { plan: data })
    return
  }

  const parsed = planFormToPayload(body?.form ?? body, { scope })
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }
  /** @type {Record<string, unknown>} */
  const patch = {
    ...parsed.payload,
    updated_at: new Date().toISOString(),
  }
  if (body?.strategy_snapshot != null) {
    const snap = validateStrategySnapshotForSave(body.strategy_snapshot)
    if (!snap.ok) {
      sendJson(res, 400, { error: snap.error })
      return
    }
    patch.strategy_snapshot = snap.snapshot
  }
  let { data, error } = await patchOrInsertClubSalesPlanRow(supabaseAdmin, {
    clubId,
    year,
    month,
    patch,
    selectCols,
  })
  if (error && (isMissingSalesColumnError(error) || /promotions/i.test(String(error.message ?? '')))) {
    const { promotions: _promo, ...patchWithoutPromo } = patch
    void _promo
    const retryPromo = await patchOrInsertClubSalesPlanRow(supabaseAdmin, {
      clubId,
      year,
      month,
      patch: patchWithoutPromo,
      selectCols: SALES_PLAN_SELECT_WITH_SNAPSHOT,
    })
    data = retryPromo.data
    error = retryPromo.error
  }
  if (error && (isMissingSalesColumnError(error) || /strategy_snapshot/i.test(String(error.message ?? '')))) {
    const { strategy_snapshot: _snap, promotions: _promo2, ...patchWithoutSnap } = patch
    void _snap
    void _promo2
    const retry = await patchOrInsertClubSalesPlanRow(supabaseAdmin, {
      clubId,
      year,
      month,
      patch: patchWithoutSnap,
      selectCols: SALES_PLAN_SELECT_FULL,
    })
    data = retry.data
    error = retry.error
  }
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { plan: data })
}

export async function handleSalesFinancePost(ctx, req, res, body) {
  const clubId = String(body?.club_id ?? '').trim()
  const year = Number(body?.year)
  const month = Number(body?.month)
  if (!clubId || !Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    sendJson(res, 400, { error: 'Укажите club_id, year, month' })
    return
  }
  const parsed = expenseFormToPayload(body?.form ?? body)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }
  const { supabaseAdmin } = ctx
  const row = {
    club_id: clubId,
    year,
    month,
    ...parsed.payload,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabaseAdmin
    .from('club_supervisor_expense')
    .upsert(row, { onConflict: 'club_id,year,month' })
    .select(SUPERVISOR_EXPENSE_SELECT_COLS)
    .single()
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { expense: data })
}

export async function handleCreateSalesManagerPost(ctx, res, body) {
  const { supabaseAdmin } = ctx

  const name = String(body.name ?? '').trim()
  const login = String(body.login ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim() || null
  const password = String(body.password ?? '')
  let email = String(body.email ?? '').trim()
  const rawClub = body.club_id != null ? String(body.club_id).trim() : ''
  const club_id =
    rawClub && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(rawClub)
      ? rawClub
      : null

  if (!name || !login || !password) {
    sendJson(res, 400, { error: 'Укажите имя, логин и пароль' })
    return
  }
  if (password.length < 6) {
    sendJson(res, 400, { error: 'Пароль не короче 6 символов' })
    return
  }
  if (!club_id) {
    sendJson(res, 400, { error: 'Выберите клуб — менеджер привязан к одному клубу' })
    return
  }
  if (!email) {
    email = `${login}@sales.local`
  }

  const { data: existingManagers } = await supabaseAdmin
    .from('users')
    .select('id, name, login')
    .eq('club_id', club_id)
    .in('role', ['sales_manager', 'менеджер по продажам'])

  const existingCount = (existingManagers ?? []).length
  let warning = null
  if (existingCount > 0) {
    warning = `В клубе уже ${existingCount} менедж(ер/еров) по продажам — учётка всё равно будет создана.`
  }

  const { data: created, error: auErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (auErr || !created?.user) {
    sendJson(res, 400, { error: auErr?.message ?? 'Не удалось создать пользователя в Auth' })
    return
  }

  const uid = created.user.id

  const insertRow = {
    id: uid,
    name,
    phone,
    email,
    login,
    role: 'sales_manager',
    password_hash: 'supabase-auth',
    is_active: true,
    club_id,
  }

  const { error: insErr } = await supabaseAdmin.from('users').insert(insertRow)

  if (insErr) {
    await supabaseAdmin.auth.admin.deleteUser(uid)
    sendJson(res, 400, { error: insErr.message })
    return
  }

  sendJson(res, 200, { ok: true, id: uid, manager: insertRow, warning })
}
