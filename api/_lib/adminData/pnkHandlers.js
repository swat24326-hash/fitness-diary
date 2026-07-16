import { sendJson } from '../adminSupabase.js'
import { formatClientName } from '../../../src/lib/clientNameFormat.js'
import { applyPnkStagePatch, canDeletePnkClient, isOpenPnkClient } from '../../../src/lib/pnk/pnkStagesCore.js'
import { mergeNewPnkOntoClient, normalizeClientPnkFields, pickClientPnkFields } from '../../../src/lib/pnk/pnkClientFields.js'
import { aggregatePnkFunnelStats, listPnkAttentionClients } from '../../../src/lib/pnk/pnkStatsAgg.js'
import { fetchClubTrainersForSales, parseJsonBody } from './salesHandlers.js'

const PNK_CLIENT_SELECT =
  'id, name, phone, card_number, trainer_id, club_id, archived_at, created_at, lifecycle, pnk_stage, pnk_source, pnk_trial_date, pnk_trial_time, pnk_comment, pnk_comments, pnk_deliverables, pnk_won_at, pnk_lost_at, pnk_lost_reason, pnk_created_at'

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

  const stats = aggregatePnkFunnelStats(clients, {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })
  const attention = listPnkAttentionClients(open)

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
    stats: {
      ...stats,
      trainers: stats.trainers.map((row) => ({
        ...row,
        trainer_name: trainerNameById.get(row.trainerId) ?? '—',
      })),
    },
    attention,
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
