import { sendJson } from '../adminSupabase.js'
import { formatClientName } from '../../../src/lib/clientNameFormat.js'
import { applyPnkStagePatch, canDeletePnkClient, isOpenPnkClient } from '../../../src/lib/pnk/pnkStagesCore.js'
import { mergeNewPnkOntoClient, normalizeClientPnkFields, pickClientPnkFields } from '../../../src/lib/pnk/pnkClientFields.js'
import { buildPnkLostFunnelEvent, normalizePnkFunnelEventPushPayload } from '../../../src/lib/pnk/pnkFunnelEventsCore.js'
import { aggregatePnkFunnelStats, listPnkAttentionClients } from '../../../src/lib/pnk/pnkStatsAgg.js'
import { buildPnkBzCompletedByClientId } from '../../../src/lib/pnk/pnkBzCompletedCore.js'
import { fetchClubTrainersForSales, parseJsonBody } from './salesHandlers.js'
import { recordClientDeletionAudit } from '../deletionAuditWrite.js'

const PNK_CLIENT_SELECT =
  'id, name, phone, card_number, trainer_id, club_id, archived_at, created_at, lifecycle, pnk_stage, pnk_source, pnk_trial_sessions, pnk_trial_date, pnk_trial_time, pnk_comment, pnk_comments, pnk_deliverables, pnk_won_at, pnk_lost_at, pnk_lost_reason, pnk_created_at'

function resolveClubId(ctx, req, body) {
  if (ctx.isSalesManager) return String(ctx.salesClubId ?? ctx.profile?.club_id ?? '').trim()
  return String(body?.club_id ?? req.query?.club_id ?? '').trim()
}

function canAccessClub(ctx, clubId) {
  if (ctx.isAdmin) return Boolean(clubId)
  if (ctx.isSalesManager) return clubId && clubId === String(ctx.salesClubId ?? ctx.profile?.club_id ?? '').trim()
  return false
}

/**
 * Completed trainings для открытых ПНК (только client_id + status) → карта 0…2.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} clubId
 * @param {object[]} openClients
 */
async function fetchPnkBzCompletedByClient(supabaseAdmin, clubId, openClients) {
  const ids = (Array.isArray(openClients) ? openClients : [])
    .map((c) => String(c?.id ?? '').trim())
    .filter(Boolean)
  if (!ids.length) return {}

  const { data, error } = await supabaseAdmin
    .from('trainings')
    .select('client_id, status')
    .eq('club_id', clubId)
    .eq('status', 'completed')
    .in('client_id', ids)
    .limit(Math.min(2000, ids.length * 8))

  if (error) {
    console.warn('[pnk] bz_completed trainings:', error.message)
    return {}
  }
  return buildPnkBzCompletedByClientId(data ?? [])
}

/**
 * GET/POST admin-data?action=pnk
 */
export async function handlePnk(ctx, req, res) {
  const method = String(req.method ?? 'GET').toUpperCase()
  if (method === 'GET') return handlePnkGet(ctx, req, res)
  if (method === 'POST') return handlePnkPost(ctx, req, res)
  sendJson(res, 405, { error: 'Метод не поддерживается' })
}

async function handlePnkGet(ctx, req, res) {
  const clubId = resolveClubId(ctx, req, {})
  if (!canAccessClub(ctx, clubId)) {
    sendJson(res, 403, { error: 'Нет доступа к клубу' })
    return
  }
  const dateFrom = String(req.query?.date_from ?? '').slice(0, 10)
  const dateTo = String(req.query?.date_to ?? '').slice(0, 10)
  const { supabaseAdmin } = ctx

  const { data, error } = await supabaseAdmin
    .from('clients')
    .select(PNK_CLIENT_SELECT)
    .eq('club_id', clubId)
    .is('archived_at', null)
    .or('lifecycle.eq.pnk,lifecycle.eq.pnk_lost,pnk_won_at.not.is.null,pnk_created_at.not.is.null')
    .order('pnk_created_at', { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) {
    sendJson(res, 500, { error: error.message || 'Ошибка загрузки ПНК' })
    return
  }

  const clients = (data ?? []).map((row) => normalizeClientPnkFields(row))
  const open = clients.filter((c) => isOpenPnkClient(c))
  const trainers = await fetchClubTrainersForSales(supabaseAdmin, clubId)
  const trainerNameById = new Map(trainers.map((t) => [t.id, t.name || t.login || t.email || '—']))
  const trainerPhoneById = new Map(trainers.map((t) => [t.id, t.phone ? String(t.phone).trim() : '']))

  const { data: eventsData, error: eventsErr } = await supabaseAdmin
    .from('pnk_funnel_events')
    .select(
      'id, club_id, trainer_id, event_type, entered_at, occurred_at, reason, had_nutrition, had_homework, trial_done, package_done, created_at',
    )
    .eq('club_id', clubId)
    .order('occurred_at', { ascending: false })
    .limit(500)
  if (eventsErr) {
    sendJson(res, 500, { error: eventsErr.message || 'Ошибка журнала ПНК' })
    return
  }
  const events = eventsData ?? []

  const stats = aggregatePnkFunnelStats(
    clients,
    {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    },
    events,
  )
  const attention = listPnkAttentionClients(open)

  const bzCompletedByClient = await fetchPnkBzCompletedByClient(supabaseAdmin, clubId, open)

  sendJson(res, 200, {
    club_id: clubId,
    clients: open.map((c) => ({
      ...c,
      trainer_name: trainerNameById.get(String(c.trainer_id)) ?? null,
      trainer_phone: trainerPhoneById.get(String(c.trainer_id)) || null,
    })),
    history: clients
      .filter((c) => !isOpenPnkClient(c))
      .slice(0, 100)
      .map((c) => ({
        ...c,
        trainer_name: trainerNameById.get(String(c.trainer_id)) ?? null,
        trainer_phone: trainerPhoneById.get(String(c.trainer_id)) || null,
      })),
    events: events.map((ev) => ({
      ...ev,
      trainer_name: trainerNameById.get(String(ev.trainer_id)) ?? null,
    })),
    stats: {
      ...stats,
      trainers: stats.trainers.map((row) => ({
        ...row,
        trainer_name: trainerNameById.get(row.trainerId) ?? '—',
      })),
    },
    attention,
    bz_completed_by_client: bzCompletedByClient,
    trainers: trainers.map((t) => ({
      id: t.id,
      name: t.name || t.login || t.email || '—',
      phone: t.phone ? String(t.phone).trim() : null,
    })),
  })
}

async function handlePnkPost(ctx, req, res) {
  const body = parseJsonBody(req)
  if (!body) {
    sendJson(res, 400, { error: 'Некорректное тело запроса' })
    return
  }
  const op = String(body.op ?? '').trim()
  const clubId = resolveClubId(ctx, req, body)
  if (!canAccessClub(ctx, clubId)) {
    sendJson(res, 403, { error: 'Нет доступа к клубу' })
    return
  }
  const { supabaseAdmin } = ctx

  if (op === 'create') {
    const name = formatClientName(body.name)
    const trainerId = String(body.trainer_id ?? '').trim()
    if (!name) {
      sendJson(res, 400, { error: 'Укажите имя клиента' })
      return
    }
    if (!trainerId) {
      sendJson(res, 400, { error: 'Укажите тренера' })
      return
    }
    const trainers = await fetchClubTrainersForSales(supabaseAdmin, clubId)
    if (!trainers.some((t) => t.id === trainerId)) {
      sendJson(res, 400, { error: 'Тренер не найден в клубе' })
      return
    }

    const pnk = mergeNewPnkOntoClient({
      trainer_id: trainerId,
      pnk_source: body.pnk_source || 'manager',
      pnk_trial_sessions: body.pnk_trial_sessions,
    })
    const insert = {
      name,
      phone: String(body.phone ?? '').trim() || null,
      card_number: null,
      trainer_id: trainerId,
      club_id: clubId,
      ...pickClientPnkFields(pnk),
    }

    const { data, error } = await supabaseAdmin.from('clients').insert(insert).select(PNK_CLIENT_SELECT).single()
    if (error) {
      sendJson(res, 500, { error: error.message || 'Не удалось создать ПНК' })
      return
    }
    sendJson(res, 200, { client: normalizeClientPnkFields(data) })
    return
  }

  if (op === 'patch') {
    const clientId = String(body.client_id ?? '').trim()
    if (!clientId) {
      sendJson(res, 400, { error: 'Укажите client_id' })
      return
    }
    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('clients')
      .select(PNK_CLIENT_SELECT)
      .eq('id', clientId)
      .eq('club_id', clubId)
      .maybeSingle()
    if (loadErr) {
      sendJson(res, 500, { error: loadErr.message || 'Ошибка чтения' })
      return
    }
    if (!existing) {
      sendJson(res, 404, { error: 'Клиент не найден' })
      return
    }

    const patched = applyPnkStagePatch({
      client: normalizeClientPnkFields(existing),
      stage: body.stage,
      trial_date: body.trial_date,
      trial_time: body.trial_time,
      trainer_id: body.trainer_id,
      deliverable: body.deliverable,
      comment: body.comment,
      lost_reason: body.lost_reason,
      by_role: ctx.isSalesManager ? 'sales_manager' : 'admin',
      by_name: ctx.profile?.name || ctx.user?.email || '',
    })
    if (!patched.ok) {
      sendJson(res, 400, { error: patched.error })
      return
    }

    const update = pickClientPnkFields(patched.client)
    if (body.trainer_id) update.trainer_id = String(body.trainer_id).trim()

    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(update)
      .eq('id', clientId)
      .eq('club_id', clubId)
      .select(PNK_CLIENT_SELECT)
      .single()
    if (error) {
      sendJson(res, 500, { error: error.message || 'Не удалось сохранить' })
      return
    }
    sendJson(res, 200, { client: normalizeClientPnkFields(data) })
    return
  }

  if (op === 'delete') {
    const clientId = String(body.client_id ?? '').trim()
    if (!clientId) {
      sendJson(res, 400, { error: 'Укажите client_id' })
      return
    }
    const { data: existing, error: loadErr } = await supabaseAdmin
      .from('clients')
      .select(PNK_CLIENT_SELECT)
      .eq('id', clientId)
      .eq('club_id', clubId)
      .maybeSingle()
    if (loadErr) {
      sendJson(res, 500, { error: loadErr.message || 'Ошибка чтения' })
      return
    }
    if (!existing) {
      sendJson(res, 404, { error: 'Клиент не найден' })
      return
    }
    const row = normalizeClientPnkFields(existing)
    if (!canDeletePnkClient(row)) {
      sendJson(res, 403, { error: 'Удалить можно только карточку ПНК (не оформленного ДК)' })
      return
    }
    const built = buildPnkLostFunnelEvent(row, {
      reason: body.lost_reason || row.pnk_lost_reason || 'Удаление / отказ',
    })
    if (built.ok) {
      const payload = normalizePnkFunnelEventPushPayload(built.event)
      if (payload) {
        const { error: evErr } = await supabaseAdmin.from('pnk_funnel_events').insert(payload)
        if (evErr && evErr.code !== '23505') {
          sendJson(res, 500, { error: evErr.message || 'Не удалось записать отказ в журнал' })
          return
        }
      }
    }
    await recordClientDeletionAudit(ctx, clientId, row, { source: 'pnk_api' })
    const { error } = await supabaseAdmin.from('clients').delete().eq('id', clientId).eq('club_id', clubId)
    if (error) {
      sendJson(res, 500, { error: error.message || 'Не удалось удалить' })
      return
    }
    sendJson(res, 200, { ok: true, client_id: clientId })
    return
  }

  sendJson(res, 400, { error: 'Неизвестная операция' })
}
