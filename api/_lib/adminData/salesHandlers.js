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
} from '../../../src/lib/admin/salesReportCore.js'
import {
  querySalesDailyRow,
  querySalesMonthRows,
  querySalesPlanRow,
  SALES_DAILY_SELECT_BASE,
  SALES_DAILY_SELECT_FULL,
  SALES_DAILY_SELECT_WITHOUT_REFUNDS,
} from '../../../src/lib/admin/adminSalesQueryResilience.js'
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
import { TRAINER_ROLES } from './constants.js'
import { fetchPaged } from './paging.js'

const TRAINER_ROLES_SALES = new Set(TRAINER_ROLES)

export async function fetchClubTrainersForSales(supabaseAdmin, clubId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, email, login, is_active, role, club_id')
    .eq('club_id', clubId)
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).filter((u) => {
    if (u?.is_active === false) return false
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
  const { year, month } = parts
  const { start, end } = monthDateRange(year, month)
  const { supabaseAdmin } = ctx

  const [dailyRes, monthRes, planRes, expenseRes, typesRes, trainers, trainingsDay, memberships] =
    await Promise.all([
    querySalesDailyRow(supabaseAdmin, clubId, reportDate),
    querySalesMonthRows(supabaseAdmin, clubId, start, end),
    querySalesPlanRow(supabaseAdmin, clubId, year, month),
    supabaseAdmin
      .from('club_supervisor_expense')
      .select('amount, updated_at')
      .eq('club_id', clubId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabaseAdmin
      .from('membership_types')
      .select('id, code, sort_order, is_active, trainer_assignable, trainer_pay_per_session, aerobic_pay_amount')
      .eq('club_id', clubId)
      .order('sort_order', { ascending: true }),
    fetchClubTrainersForSales(supabaseAdmin, clubId),
    fetchPaged(
      supabaseAdmin,
      'trainings',
      'id, trainer_id, client_id, date, status, data',
      clubId,
      reportDate,
      reportDate,
    ),
    fetchPaged(
      supabaseAdmin,
      'memberships',
      'id, client_id, membership_type_id',
      clubId,
      null,
      null,
    ),
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

  const fitCityTypeStats = aggregateMembershipTypeStats({
    trainings: trainingsDay,
    memberships,
    membershipTypes,
  })

  const daily = dailyRes.data ?? null
  if (daily && daily.trainings_matrix != null) {
    daily.trainings_matrix = normalizeMatrixRowsFromDb(daily.trainings_matrix)
  }
  if (daily && daily.aerobic_sales_matrix != null) {
    daily.aerobic_sales_matrix = normalizeAerobicRowsFromDb(daily.aerobic_sales_matrix)
  }

  sendJson(res, 200, stripSalesBundleForManager({
    club_id: clubId,
    year,
    month,
    report_date: reportDate,
    daily,
    month_days: monthRows,
    plan: planRes.data ?? null,
    expense: expenseRes.data ?? null,
    month_summary: monthSummary,
    membership_types: membershipTypes,
    trainers,
    fit_city_type_stats: fitCityTypeStats,
  }, ctx.isSalesManager === true))
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
  const { supabaseAdmin, user } = ctx
  const row = {
    club_id: clubId,
    report_date: reportDate,
    ...parsed.payload,
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  }
  let { data, error } = await supabaseAdmin
    .from('club_sales_daily')
    .upsert(row, { onConflict: 'club_id,report_date' })
    .select(SALES_DAILY_SELECT_FULL)
    .single()
  if (error) {
    const { refunds_amount: _refunds, ...rowWithoutRefunds } = row
    void _refunds
    const retry = await supabaseAdmin
      .from('club_sales_daily')
      .upsert(rowWithoutRefunds, { onConflict: 'club_id,report_date' })
      .select(SALES_DAILY_SELECT_WITHOUT_REFUNDS)
      .single()
    data = retry.data
    error = retry.error
  }
  if (error) {
    const { matrix_amounts: _drop, refunds_amount: _refunds2, ...rowWithoutAmounts } = row
    void _drop
    void _refunds2
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
    body?.scope === 'levels' || body?.scope === 'directions' ? body.scope : 'all'
  const parsed = planFormToPayload(body?.form ?? body, { scope })
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
    .from('club_sales_plan')
    .upsert(row, { onConflict: 'club_id,year,month' })
    .select('plan_total, plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az, plan_extra, plan_matrix, updated_at')
    .single()
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
    amount: parsed.payload.amount,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabaseAdmin
    .from('club_supervisor_expense')
    .upsert(row, { onConflict: 'club_id,year,month' })
    .select('amount, updated_at')
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
