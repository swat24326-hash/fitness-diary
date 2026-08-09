/**
 * Снимок данных тренера: клиенты, абонементы, карты здоровья, тренировки за 90 дней (service role).
 * GET — только для role=trainer
 */
import { requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { TRAINER_PULL_MAX_TRAININGS, TRAINER_PULL_BODY_MEASUREMENTS_MONTHS, TRAINER_PULL_MAX_BODY_MEASUREMENTS, TRAINER_PULL_WEIGHT_ENTRIES_MONTHS, TRAINER_PULL_MAX_WEIGHT_ENTRIES } from './_lib/apiLimits.js'
import { loadClubIskraSettings } from './_lib/iskraSettingsHandler.js'
import { normalizeMatrixRowsFromDb } from '../src/lib/admin/salesTrainingsMatrix.js'
import {
  aggregatePayrollFromDailyRows,
  buildTrainerPayRateMap,
} from '../src/lib/admin/trainerPayrollCore.js'

const PAGE = 500
const IN_CHUNK = 80

async function handleTrainerPayrollGet(ctx, req, res) {
  const dateFrom = String(req.query?.date_from ?? req.query?.dateFrom ?? '').slice(0, 10)
  const dateTo = String(req.query?.date_to ?? req.query?.dateTo ?? '').slice(0, 10)
  if (!dateFrom || !dateTo || dateFrom > dateTo) {
    sendJson(res, 400, { error: 'Укажите date_from и date_to (YYYY-MM-DD)' })
    return
  }

  const trainerId = ctx.user.id
  const { supabaseAdmin } = ctx
  const profileRes = await supabaseAdmin
    .from('users')
    .select('club_id')
    .eq('id', trainerId)
    .maybeSingle()
  const clubId = String(profileRes.data?.club_id ?? '').trim()
  if (profileRes.error) {
    sendJson(res, 400, { error: profileRes.error.message })
    return
  }
  if (!clubId) {
    sendJson(res, 400, { error: 'У тренера не указан клуб' })
    return
  }

  const [typesRes, dailyRes] = await Promise.all([
    supabaseAdmin
      .from('membership_types')
      .select('id, code, sort_order, is_active, trainer_assignable, trainer_pay_per_session, trainer_pay_l1, trainer_pay_l2, trainer_pay_l3')
      .eq('club_id', clubId)
      .eq('trainer_assignable', true)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('club_sales_daily')
      .select('report_date, trainings_matrix')
      .eq('club_id', clubId)
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)
      .order('report_date', { ascending: true }),
  ])

  const err = typesRes.error || dailyRes.error
  if (err) {
    sendJson(res, 400, { error: err.message })
    return
  }

  const membershipTypes = typesRes.data ?? []
  const dailyRows = (dailyRes.data ?? []).map((row) => ({
    ...row,
    trainings_matrix: normalizeMatrixRowsFromDb(row.trainings_matrix),
  }))
  const {
    loadTrainerPayrollContext,
    payrollOptsFromContext,
    payrollYearMonthFromIso,
  } = await import('./_lib/trainerPayrollContext.js')
  const ym = payrollYearMonthFromIso(dateTo) ?? payrollYearMonthFromIso(dateFrom)
  const payrollCtx = await loadTrainerPayrollContext(supabaseAdmin, clubId, {
    year: ym?.year,
    month: ym?.month,
    membershipTypes,
  })
  const payTypes =
    payrollCtx.frozen && payrollCtx.membershipTypes?.length
      ? payrollCtx.membershipTypes
      : membershipTypes
  const payroll = aggregatePayrollFromDailyRows(
    dailyRows,
    buildTrainerPayRateMap(payTypes),
    payrollOptsFromContext(payrollCtx, membershipTypes, { trainerIdFilter: trainerId }),
  )

  const entry = payroll.byTrainer.get(trainerId)

  sendJson(res, 200, {
    club_id: clubId,
    trainer_id: trainerId,
    date_from: dateFrom,
    date_to: dateTo,
    membership_types: membershipTypes.map((t) => ({
      id: t.id,
      code: t.code,
      trainer_pay_per_session: Number(t.trainer_pay_per_session) || 0,
      trainer_pay_l1: Number(t.trainer_pay_l1 ?? t.trainer_pay_per_session) || 0,
      trainer_pay_l2: Number(t.trainer_pay_l2 ?? t.trainer_pay_per_session) || 0,
      trainer_pay_l3: Number(t.trainer_pay_l3 ?? t.trainer_pay_per_session) || 0,
      is_active: t.is_active !== false,
    })),
    report_payroll: {
      total: entry?.total ?? 0,
      by_type: entry?.byType ?? [],
      day_count: dailyRows.length,
    },
    rates_note: payrollCtx.frozen
      ? 'Расчёт по замороженным ставкам закрытого месяца; «Без типа» не оплачивается.'
      : 'Расчёт по текущим ставкам типов абонементов; «Без типа» не оплачивается.',
  })
}

async function handler(req, res) {
  setCors(res, 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const ctx = await requireAuthUser(req, res)
  if (!ctx) return

  if (ctx.isAdmin) {
    sendJson(res, 403, { error: 'Только для тренера' })
    return
  }
  if (!ctx.isTrainer) {
    sendJson(res, 403, { error: 'Только для тренера' })
    return
  }

  if (String(req.query?.mode ?? '').trim() === 'payroll') {
    return handleTrainerPayrollGet(ctx, req, res)
  }

  const trainerId = ctx.user.id
  const { supabaseAdmin } = ctx
  const profileRes = await supabaseAdmin.from('users').select('club_id').eq('id', trainerId).maybeSingle()
  const trainerClubId = String(profileRes.data?.club_id ?? '').trim()
  const includeArchived = String(req.query?.include_archived ?? req.query?.includeArchived ?? '').trim() === '1'
  const archivedOnly = String(req.query?.archived ?? '').trim() === '1'
  const skipTrainings = String(req.query?.skip_trainings ?? '').trim() === '1'
  const trainingsSinceRaw = String(req.query?.trainings_since ?? req.query?.trainingsSince ?? '').slice(0, 10)
  const trainingsSince = /^\d{4}-\d{2}-\d{2}$/.test(trainingsSinceRaw) ? trainingsSinceRaw : ''

  const clients = []
  let from = 0
  for (;;) {
    let q = supabaseAdmin.from('clients').select('*').eq('trainer_id', trainerId)
    if (!includeArchived) {
      if (archivedOnly) q = q.not('archived_at', 'is', null)
      else q = q.is('archived_at', null)
    }
    const { data, error } = await q.order('name', { ascending: true }).range(from, from + PAGE - 1)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    const rows = data ?? []
    clients.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  const clientIds = clients.map((c) => c.id).filter(Boolean)
  const memberships = []
  const health_cards = []

  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue

    const { data: mem, error: me } = await supabaseAdmin.from('memberships').select('*').in('client_id', chunk)
    if (me) {
      sendJson(res, 400, { error: me.message })
      return
    }
    memberships.push(...(mem ?? []))

    const { data: hc, error: he } = await supabaseAdmin.from('health_cards').select('*').in('client_id', chunk)
    if (he) {
      sendJson(res, 400, { error: he.message })
      return
    }
    health_cards.push(...(hc ?? []))
  }

  const body_measurements = []
  const measurementsSince = new Date()
  measurementsSince.setMonth(measurementsSince.getMonth() - TRAINER_PULL_BODY_MEASUREMENTS_MONTHS)
  const measurementsSinceIso = measurementsSince.toISOString().slice(0, 10)
  let bodyMeasurementsTruncated = false

  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue

    const { data: bm, error: bme } = await supabaseAdmin
      .from('body_measurements')
      .select('*')
      .in('client_id', chunk)
      .gte('date', measurementsSinceIso)
      .order('date', { ascending: false })
    if (bme) {
      sendJson(res, 400, { error: bme.message })
      return
    }
    for (const row of bm ?? []) {
      if (body_measurements.length >= TRAINER_PULL_MAX_BODY_MEASUREMENTS) {
        bodyMeasurementsTruncated = true
        break
      }
      body_measurements.push(row)
    }
    if (bodyMeasurementsTruncated) break
  }

  const client_weight_entries = []
  const weightSince = new Date()
  weightSince.setMonth(weightSince.getMonth() - TRAINER_PULL_WEIGHT_ENTRIES_MONTHS)
  const weightSinceIso = weightSince.toISOString().slice(0, 10)
  let weightEntriesTruncated = false

  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue

    const { data: we, error: wee } = await supabaseAdmin
      .from('client_weight_entries')
      .select('*')
      .in('client_id', chunk)
      .gte('date', weightSinceIso)
      .order('date', { ascending: false })
    if (wee) {
      sendJson(res, 400, { error: wee.message })
      return
    }
    for (const row of we ?? []) {
      if (client_weight_entries.length >= TRAINER_PULL_MAX_WEIGHT_ENTRIES) {
        weightEntriesTruncated = true
        break
      }
      client_weight_entries.push(row)
    }
    if (weightEntriesTruncated) break
  }

  const trainings = []
  let trainingsTruncated = false
  if (!skipTrainings) {
    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - 90)
    const dateFromIso = trainingsSince || dateFrom.toISOString().slice(0, 10)

    outer: for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
      const chunk = clientIds.slice(i, i + IN_CHUNK)
      if (!chunk.length) continue

      const { data: tr, error: te } = await supabaseAdmin
        .from('trainings')
        .select('*')
        .in('client_id', chunk)
        .gte('date', dateFromIso)
        .order('date', { ascending: false })
      if (te) {
        sendJson(res, 400, { error: te.message })
        return
      }
      for (const row of tr ?? []) {
        if (trainings.length >= TRAINER_PULL_MAX_TRAININGS) {
          trainingsTruncated = true
          break outer
        }
        trainings.push(row)
      }
    }
  }

  let outreach_templates = null
  if (trainerClubId) {
    try {
      const settings = await loadClubIskraSettings(supabaseAdmin, trainerClubId)
      outreach_templates = settings.outreach_templates ?? null
    } catch {
      outreach_templates = null
    }
  }

  let pnk_funnel_events = []
  try {
    const { data: evRows, error: evErr } = await supabaseAdmin
      .from('pnk_funnel_events')
      .select(
        'id, club_id, trainer_id, event_type, entered_at, occurred_at, reason, had_nutrition, had_homework, trial_done, package_done, created_at',
      )
      .eq('trainer_id', trainerId)
      .order('occurred_at', { ascending: false })
      .limit(200)
    if (!evErr) pnk_funnel_events = evRows ?? []
  } catch {
    pnk_funnel_events = []
  }

  let sale_clips = []
  try {
    const { data: clipRows, error: clipErr } = await supabaseAdmin
      .from('sale_clips')
      .select(
        'id, club_id, trainer_id, client_id, membership_id, status, clip_date, client_name, phone, card_number, birth_date, membership_type_id, membership_type_label, total_trainings, start_date, end_date, note, created_by, created_at, updated_at, done_at',
      )
      .eq('trainer_id', trainerId)
      .eq('status', 'awaiting')
      .order('created_at', { ascending: false })
      .limit(100)
    if (!clipErr) sale_clips = clipRows ?? []
  } catch {
    sale_clips = []
  }

  sendJson(res, 200, {
    clients,
    memberships,
    health_cards,
    body_measurements,
    client_weight_entries,
    trainings,
    pnk_funnel_events,
    sale_clips,
    club_id: trainerClubId || null,
    outreach_templates,
    trainings_truncated: trainingsTruncated,
    body_measurements_truncated: bodyMeasurementsTruncated,
    weight_entries_truncated: weightEntriesTruncated,
    measurements_since: measurementsSinceIso,
    weight_entries_since: weightSinceIso,
    trainings_since: trainingsSince || null,
    incremental: Boolean(trainingsSince),
    count: {
      clients: clients.length,
      memberships: memberships.length,
      health_cards: health_cards.length,
      body_measurements: body_measurements.length,
      client_weight_entries: client_weight_entries.length,
      trainings: trainings.length,
      pnk_funnel_events: pnk_funnel_events.length,
      sale_clips: sale_clips.length,
    },
  })
}

export default withSafeApiHandler(handler, { label: 'trainer-pull' })
