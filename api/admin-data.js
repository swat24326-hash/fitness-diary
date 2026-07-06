/**
 * Объединённый GET API админки/тренера (лимит Vercel Hobby: 12 functions).
 * ?action=search|journal|club-stats|health-cards|challenges|challenge-trainings|exercises|clubs
 */
import { requireAdmin, requireAdminOrSalesManager, requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { assertSalesPlanScopeForRole, stripSalesBundleForManager } from '../src/lib/admin/salesAccessCore.js'
import { aggregateTrainings, aggregateClubClientPeriod } from './_lib/clubStatsAgg.js'
import { aggregateMembershipTypeStats } from './_lib/membershipTypeStatsAgg.js'
import {
  aggregateMonthlyTypedCompleted,
  aggregateMonthlyForCalendarYear,
  discoverMonthlyChartYears,
  summarizeCalendarYearMonthlyEligibility,
} from './_lib/clubMonthlyAgg.js'
import {
  aggregateMonthFromDailyRows,
  buildHallFinanceSummary,
  dailyFormToPayload,
  expenseFormToPayload,
  monthDateRange,
  monthPartsFromIso,
  planFormToPayload,
} from '../src/lib/admin/salesReportCore.js'
import {
  querySalesDailyRow,
  querySalesMonthRows,
  querySalesPlanRow,
  SALES_DAILY_SELECT_BASE,
  SALES_DAILY_SELECT_FULL,
  SALES_DAILY_SELECT_WITHOUT_REFUNDS,
} from '../src/lib/admin/adminSalesQueryResilience.js'
import { normalizeMatrixRowsFromDb } from '../src/lib/admin/salesTrainingsMatrix.js'
import { normalizeAerobicRowsFromDb } from '../src/lib/admin/aerobicSalesMatrix.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
  computeNetProfitWithPayroll,
} from '../src/lib/admin/trainerPayrollCore.js'
import {
  aggregateAerobicPayrollFromDailyRows,
  buildAerobicPayRateMap,
} from '../src/lib/admin/aerobicPayrollCore.js'
import { filterAerobicSalesTypes } from '../src/lib/membershipTypesCore.js'
import { handleGeminiAnalyticsPost, handleGeminiAnalyticsPrefetchGet } from './_lib/geminiAnalyticsHandler.js'
import { handleIskraSettingsGet, handleIskraSettingsPost } from './_lib/iskraSettingsHandler.js'

const PAGE = 400
const IN_CHUNK = 80
const CLIENT_BRIEF = 'id, name, phone, email, trainer_id, club_id, card_number'
const TRAINER_ROLES = ['trainer', 'тренер']
const MAX_JOURNAL_PAGE = 100

function escapeForIlike(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

async function handleSearch(ctx, req, res) {
  const raw = String(req.query?.q ?? req.query?.query ?? '').trim()
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50))
  if (raw.length < 2) {
    sendJson(res, 200, { clients: [] })
    return
  }
  const pattern = `%${escapeForIlike(raw)}%`
  const part = Math.min(limit, Math.max(20, Math.ceil(limit / 3)))
  const { supabaseAdmin } = ctx
  let qName = supabaseAdmin.from('clients').select(CLIENT_BRIEF).ilike('name', pattern).limit(part)
  let qPhone = supabaseAdmin.from('clients').select(CLIENT_BRIEF).ilike('phone', pattern).limit(part)
  if (clubId) {
    qName = qName.eq('club_id', clubId)
    qPhone = qPhone.eq('club_id', clubId)
  }
  const [{ data: byName, error: e1 }, { data: byPhone, error: e2 }] = await Promise.all([qName, qPhone])
  if (e1) {
    sendJson(res, 400, { error: e1.message })
    return
  }
  if (e2) {
    sendJson(res, 400, { error: e2.message })
    return
  }
  const { data: trainerHits } = await supabaseAdmin
    .from('users')
    .select('id')
    .in('role', TRAINER_ROLES)
    .ilike('name', pattern)
    .limit(part)
  const tidList = [...new Set((trainerHits ?? []).map((t) => t.id).filter(Boolean))]
  let byTrainer = []
  if (tidList.length) {
    let qc = supabaseAdmin.from('clients').select(CLIENT_BRIEF).in('trainer_id', tidList).limit(part)
    if (clubId) qc = qc.eq('club_id', clubId)
    const { data, error: e4 } = await qc
    if (e4) {
      sendJson(res, 400, { error: e4.message })
      return
    }
    byTrainer = data ?? []
  }
  const map = new Map()
  for (const c of [...(byName ?? []), ...(byPhone ?? []), ...byTrainer]) {
    if (c?.id && !map.has(c.id)) map.set(c.id, c)
  }
  sendJson(res, 200, { clients: [...map.values()].slice(0, limit) })
}

async function handleJournal(ctx, req, res) {
  const page = Math.max(0, Number(req.query?.page) || 0)
  const size = Math.min(MAX_JOURNAL_PAGE, Math.max(1, Number(req.query?.page_size ?? req.query?.pageSize) || 50))
  const { supabaseAdmin } = ctx
  let q = supabaseAdmin.from('trainings').select('*', { count: 'exact' })
  const clubId = String(req.query?.club_id ?? '').trim()
  const trainerId = String(req.query?.trainer_id ?? '').trim()
  const clientId = String(req.query?.client_id ?? '').trim()
  const status = String(req.query?.status ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? '').trim()
  const dateTo = String(req.query?.date_to ?? '').trim()
  if (clubId) q = q.eq('club_id', clubId)
  if (trainerId) q = q.eq('trainer_id', trainerId)
  if (clientId) q = q.eq('client_id', clientId)
  if (status) q = q.eq('status', status)
  if (dateFrom) q = q.gte('date', dateFrom)
  if (dateTo) q = q.lte('date', dateTo)
  const start = page * size
  const { data, error, count } = await q
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + size - 1)
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  const rows = data ?? []
  const clientIds = [...new Set(rows.map((t) => t.client_id).filter(Boolean))]
  const clientsById = {}
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    const { data: clients, error: ce } = await supabaseAdmin.from('clients').select(CLIENT_BRIEF).in('id', chunk)
    if (ce) {
      sendJson(res, 400, { error: ce.message })
      return
    }
    for (const c of clients ?? []) clientsById[c.id] = c
  }
  sendJson(res, 200, { trainings: rows, clientsById, totalCount: count ?? rows.length, page, pageSize: size })
}

async function fetchPaged(supabaseAdmin, table, select, clubId, dateFrom, dateTo) {
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

async function handleClubStats(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? '').trim()
  const dateTo = String(req.query?.date_to ?? '').trim()
  if (!clubId || !dateFrom || !dateTo || dateFrom > dateTo) {
    sendJson(res, 400, { error: 'Укажите club_id, date_from, date_to' })
    return
  }
  try {
    const { supabaseAdmin } = ctx
    const [trainings, clients, memberships, membershipTypes] = await Promise.all([
      fetchPaged(supabaseAdmin, 'trainings', 'id, trainer_id, client_id, date, status, data', clubId, dateFrom, dateTo),
      fetchPaged(supabaseAdmin, 'clients', 'id, name, phone, archived_at, trainer_id', clubId, null, null),
      fetchPaged(
        supabaseAdmin,
        'memberships',
        'id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id',
        clubId,
        null,
        null,
      ),
      fetchPaged(supabaseAdmin, 'membership_types', 'id, code, sort_order, is_active', clubId, null, null),
    ])
    sendJson(res, 200, {
      ...aggregateTrainings(trainings),
      ...aggregateClubClientPeriod(clients, memberships, dateFrom, dateTo),
      ...aggregateMembershipTypeStats({ trainings, memberships, membershipTypes }),
      source: 'admin_api',
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка' })
  }
}

async function handleHealthCards(ctx, req, res) {
  const rawClub = String(req.query?.club_id ?? '').trim()
  if (!rawClub) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  const { supabaseAdmin } = ctx
  const clientIds = []
  let from = 0
  for (;;) {
    const { data, error } = await supabaseAdmin.from('clients').select('id').eq('club_id', rawClub).range(from, from + PAGE - 1)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    const rows = data ?? []
    for (const r of rows) {
      if (r?.id) clientIds.push(r.id)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  const health_cards = []
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue
    const { data, error } = await supabaseAdmin.from('health_cards').select('*').in('client_id', chunk)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    health_cards.push(...(data ?? []))
  }
  const body_measurements = []
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue
    const { data: bm, error: bme } = await supabaseAdmin
      .from('body_measurements')
      .select('*')
      .in('client_id', chunk)
      .order('date', { ascending: false })
    if (bme) {
      sendJson(res, 400, { error: bme.message })
      return
    }
    body_measurements.push(...(bm ?? []))
  }
  sendJson(res, 200, {
    health_cards,
    body_measurements,
    count: health_cards.length,
    body_measurements_count: body_measurements.length,
    club_id: rawClub,
  })
}

async function handleChallenges(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (authCtx.isTrainer && !authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Челленджи другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Челленджи другого клуба недоступны' })
        return
      }
    }
  }
  const { data, error } = await authCtx.supabaseAdmin
    .from('challenges')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { challenges: data ?? [], count: (data ?? []).length, club_id: clubId })
}

/** Завершённые и черновики тренировок клуба за период — для рейтинга челленджа. */
async function handleChallengeTrainings(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? req.query?.dateFrom ?? '').trim()
  const dateTo = String(req.query?.date_to ?? req.query?.dateTo ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (!dateFrom || !dateTo) {
    sendJson(res, 400, { error: 'Укажите date_from и date_to (YYYY-MM-DD)' })
    return
  }

  if (authCtx.isTrainer && !authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Тренировки другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Нет доступа к тренировкам этого клуба' })
        return
      }
    }
  }

  const trainings = await fetchPaged(authCtx.supabaseAdmin, 'trainings', '*', clubId, dateFrom, dateTo)
  sendJson(res, 200, { trainings, count: trainings.length, club_id: clubId, date_from: dateFrom, date_to: dateTo })
}

async function handleClubs(ctx, res) {
  const { data, error } = await ctx.supabaseAdmin.from('clubs').select('*').order('id', { ascending: true })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { clubs: data ?? [], count: (data ?? []).length })
}

async function handleMembershipTypes(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  if (!authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Типы другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Нет доступа к типам этого клуба' })
        return
      }
    }
  }

  const { data, error } = await authCtx.supabaseAdmin
    .from('membership_types')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  const rows = data ?? []
  sendJson(res, 200, { membership_types: rows, count: rows.length, club_id: clubId })
}

async function handleExercisesMeta(authCtx, res) {
  const { count, error: countErr } = await authCtx.supabaseAdmin
    .from('exercises')
    .select('*', { count: 'exact', head: true })
  if (countErr) {
    sendJson(res, 400, { error: countErr.message })
    return
  }
  const { data: latest, error: latestErr } = await authCtx.supabaseAdmin
    .from('exercises')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  if (latestErr) {
    sendJson(res, 400, { error: latestErr.message })
    return
  }
  const max_created_at = latest?.[0]?.created_at ?? null
  sendJson(res, 200, { count: count ?? 0, max_created_at })
}

async function handleExercises(authCtx, res) {
  const all = []
  let from = 0
  let maxCreatedAt = null
  for (;;) {
    const { data, error } = await authCtx.supabaseAdmin
      .from('exercises')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    const chunk = data ?? []
    for (const row of chunk) {
      const t = String(row.created_at ?? '')
      if (t && (!maxCreatedAt || t > maxCreatedAt)) maxCreatedAt = t
    }
    all.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  sendJson(res, 200, { exercises: all, count: all.length, max_created_at: maxCreatedAt })
}

const TRAINER_ROLES_SALES = new Set(TRAINER_ROLES)

async function fetchClubTrainersForSales(supabaseAdmin, clubId) {
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

function parseJsonBody(req) {
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

async function handleSalesGet(ctx, req, res) {
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

async function handleSalesDailyPost(ctx, req, res, body) {
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

async function handleSalesPlanPost(ctx, req, res, body) {
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
    .select('plan_total, plan_level_1, plan_level_2, plan_level_3, plan_pz, plan_tz, plan_az, plan_extra, updated_at')
    .single()
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { plan: data })
}

async function handleSalesFinancePost(ctx, req, res, body) {
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

async function handleClubMonthly(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const yearOnly = String(req.query?.year ?? '').trim()

  if (yearOnly) {
    const y = Number(yearOnly)
    if (!clubId || !Number.isFinite(y) || y < 2000) {
      sendJson(res, 400, { error: 'Укажите club_id и year' })
      return
    }
    try {
      const { supabaseAdmin } = ctx
      const yearStart = `${y}-01-01`
      const yearEnd = `${y}-12-31`
      const [trainings, memberships, allTrainings] = await Promise.all([
        fetchPaged(supabaseAdmin, 'trainings', 'id, date, status, data', clubId, yearStart, yearEnd),
        fetchPaged(supabaseAdmin, 'memberships', 'id, membership_type_id', clubId, null, null),
        fetchPaged(supabaseAdmin, 'trainings', 'id, date, status', clubId, null, null),
      ])
      sendJson(res, 200, {
        months: aggregateMonthlyForCalendarYear({
          trainings,
          memberships,
          year: y,
        }),
        years: discoverMonthlyChartYears(allTrainings, { anchorYear: y }),
        yearSummary: summarizeCalendarYearMonthlyEligibility({
          trainings,
          memberships,
          year: y,
        }),
        club_id: clubId,
        year: y,
      })
    } catch (e) {
      sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка' })
    }
    return
  }

  const anchorTo = String(req.query?.anchor_to ?? '').slice(0, 10)
  const months = Math.max(3, Math.min(36, Number(req.query?.months ?? 12) || 12))
  if (!clubId || !anchorTo) {
    sendJson(res, 400, { error: 'Укажите club_id, anchor_to или year' })
    return
  }
  try {
    const { supabaseAdmin } = ctx
    const y = Number(anchorTo.slice(0, 4))
    const m1 = Number(anchorTo.slice(5, 7))
    const start = new Date(y, m1 - 1 - (months - 1), 1)
    const end = new Date(y, m1, 0) // последний день месяца anchorTo
    const dateFrom = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
    const dateTo = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`

    const [trainings, memberships] = await Promise.all([
      fetchPaged(supabaseAdmin, 'trainings', 'id, date, status, data', clubId, dateFrom, dateTo),
      fetchPaged(supabaseAdmin, 'memberships', 'id, membership_type_id', clubId, null, null),
    ])

    const rows = aggregateMonthlyTypedCompleted({ trainings, memberships, anchorTo, months })
    sendJson(res, 200, { months: rows, club_id: clubId, anchor_to: anchorTo })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка' })
  }
}

async function handleCreateSalesManagerPost(ctx, res, body) {
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

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  const action = String(req.query?.action ?? '').trim().toLowerCase()

  if (req.method === 'POST') {
    const postActions = new Set([
      'sales-daily',
      'sales-plan',
      'sales-finance',
      'gemini-analytics',
      'create-sales-manager',
      'iskra-settings',
    ])
    if (!postActions.has(action)) {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const body = parseJsonBody(req)
    if (!body) {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
    if (action === 'gemini-analytics') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleGeminiAnalyticsPost(ctx, req, res, body)
    }
    if (action === 'sales-finance') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleSalesFinancePost(ctx, req, res, body)
    }
    if (action === 'create-sales-manager') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleCreateSalesManagerPost(ctx, res, body)
    }
    if (action === 'iskra-settings') {
      const ctx = await requireAdmin(req, res)
      if (!ctx) return
      return handleIskraSettingsPost(ctx, res, body)
    }
    const clubId = String(body?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    if (action === 'sales-daily') return handleSalesDailyPost(ctx, req, res, body)
    if (action === 'sales-plan') {
      const scope =
        body?.scope === 'levels' || body?.scope === 'directions' ? body.scope : 'all'
      const scopeCheck = assertSalesPlanScopeForRole(scope, ctx.isSalesManager === true)
      if (!scopeCheck.ok) {
        sendJson(res, 403, { error: scopeCheck.error })
        return
      }
      return handleSalesPlanPost(ctx, req, res, body)
    }
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  const trainerActions = new Set([
    'challenges',
    'challenge-trainings',
    'exercises',
    'exercises-meta',
    'membership-types',
  ])

  if (trainerActions.has(action)) {
    const authCtx = await requireAuthUser(req, res)
    if (!authCtx) return
    if (!authCtx.isAdmin && !authCtx.isTrainer) {
      sendJson(res, 403, { error: 'Нет доступа' })
      return
    }
    if (action === 'challenges') return handleChallenges(authCtx, req, res)
    if (action === 'challenge-trainings') return handleChallengeTrainings(authCtx, req, res)
    if (action === 'exercises-meta') return handleExercisesMeta(authCtx, res)
    if (action === 'exercises') return handleExercises(authCtx, res)
    if (action === 'membership-types') return handleMembershipTypes(authCtx, req, res)
  }

  if (action === 'sales') {
    const clubId = String(req.query?.club_id ?? '').trim()
    const ctx = await requireAdminOrSalesManager(req, res, clubId)
    if (!ctx) return
    return handleSalesGet(ctx, req, res)
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  switch (action) {
    case 'search':
      return handleSearch(ctx, req, res)
    case 'journal':
      return handleJournal(ctx, req, res)
    case 'club-stats':
      return handleClubStats(ctx, req, res)
    case 'club-monthly':
      return handleClubMonthly(ctx, req, res)
    case 'health-cards':
      return handleHealthCards(ctx, req, res)
    case 'clubs':
      return handleClubs(ctx, res)
    case 'gemini-analytics-prefetch':
      return handleGeminiAnalyticsPrefetchGet(ctx, req, res)
    case 'iskra-settings':
      return handleIskraSettingsGet(ctx, req, res)
    default:
      sendJson(res, 400, {
        error:
          'Укажите action: search, journal, club-stats, club-monthly, health-cards, sales, gemini-analytics-prefetch, iskra-settings, challenges, challenge-trainings, exercises, membership-types, clubs',
      })
  }
}
