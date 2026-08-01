/**
 * API: admin-data?action=sale-clips — список / создание / отмена клип-карт.
 */
import { sendJson } from '../adminSupabase.js'
import { planSaleClipCreate, normalizeSaleClipStatus } from '../../../src/lib/admin/saleClipCore.js'
import { matchClientByCardThenPhone } from '../../../src/lib/admin/salesClientMatchCore.js'
import { isHoldingTrainerUser } from '../../../src/lib/admin/deskClosingImportCore.js'
import { isOpenPnkClient } from '../../../src/lib/pnk/pnkStagesCore.js'

const CLIP_SELECT =
  'id, club_id, trainer_id, client_id, membership_id, status, clip_date, client_name, phone, card_number, birth_date, membership_type_id, membership_type_label, total_trainings, start_date, end_date, note, created_by, created_at, updated_at, done_at'

function parseBody(req) {
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

function clubScopeOk(ctx, clubId) {
  if (ctx.isAdmin) return true
  if (ctx.isSalesManager) {
    return clubId && clubId === String(ctx.salesClubId ?? ctx.profile?.club_id ?? '').trim()
  }
  return false
}

/**
 * GET — список клипов клуба (день / awaiting).
 */
export async function handleSaleClipsGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const clipDate = String(req.query?.clip_date ?? '').slice(0, 10)
  const status = String(req.query?.status ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (!clubScopeOk(ctx, clubId)) {
    sendJson(res, 403, { error: 'Нет доступа к клубу' })
    return
  }

  let q = ctx.supabaseAdmin.from('sale_clips').select(CLIP_SELECT).eq('club_id', clubId)
  if (/^\d{4}-\d{2}-\d{2}$/.test(clipDate)) q = q.eq('clip_date', clipDate)
  if (status === 'awaiting' || status === 'done' || status === 'cancelled') q = q.eq('status', status)
  q = q.order('created_at', { ascending: false }).limit(200)

  const { data, error } = await q
  if (error) {
    sendJson(res, 400, { error: error.message || 'Не удалось загрузить клипы' })
    return
  }
  sendJson(res, 200, { clips: data ?? [] })
}

/**
 * POST — create | cancel
 */
export async function handleSaleClipsPost(ctx, req, res) {
  const body = parseBody(req)
  if (!body) {
    sendJson(res, 400, { error: 'Некорректное тело запроса' })
    return
  }
  const op = String(body.op ?? 'create').trim()
  const clubId = String(body.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (!clubScopeOk(ctx, clubId)) {
    sendJson(res, 403, { error: 'Нет доступа к клубу' })
    return
  }

  if (op === 'match') {
    const card = String(body.card_number ?? body.card ?? '').trim()
    const phone = String(body.phone ?? '').trim()
    const clipDate = String(body.clip_date ?? '').slice(0, 10)
    const { data: clubClients, error: cErr } = await ctx.supabaseAdmin
      .from('clients')
      .select('id, name, phone, card_number, trainer_id, club_id, lifecycle, archived_at')
      .eq('club_id', clubId)
      .is('archived_at', null)
      .limit(5000)
    if (cErr) {
      sendJson(res, 400, { error: cErr.message || 'Не удалось загрузить клиентов', reason: cErr.message })
      return
    }
    const match = matchClientByCardThenPhone({
      clients: clubClients ?? [],
      cardNumber: card,
      phone,
    })
    let clipToday = null
    if (match.status === 'one' && /^\d{4}-\d{2}-\d{2}$/.test(clipDate)) {
      const { data: clips } = await ctx.supabaseAdmin
        .from('sale_clips')
        .select(CLIP_SELECT)
        .eq('club_id', clubId)
        .eq('clip_date', clipDate)
        .eq('client_id', match.client.id)
        .order('created_at', { ascending: false })
        .limit(1)
      clipToday = clips?.[0] ?? null
    }
    sendJson(res, 200, {
      match: {
        status: match.status,
        reason: match.reason,
        matchedBy: match.matchedBy,
        weakMatch: match.weakMatch,
        client:
          match.status === 'one'
            ? {
                id: match.client.id,
                name: match.client.name,
                phone: match.client.phone,
                card_number: match.client.card_number,
                trainer_id: match.client.trainer_id,
              }
            : null,
        candidates:
          match.status === 'conflict'
            ? (match.matches ?? []).map((c) => ({
                id: c.id,
                name: c.name,
                phone: c.phone,
                card_number: c.card_number,
              }))
            : [],
      },
      clipToday,
    })
    return
  }

  if (op === 'cancel') {
    const id = String(body.id ?? '').trim()
    if (!id) {
      sendJson(res, 400, { error: 'Укажите id клипа' })
      return
    }
    const { data: row, error: loadErr } = await ctx.supabaseAdmin
      .from('sale_clips')
      .select('id, status, club_id')
      .eq('id', id)
      .maybeSingle()
    if (loadErr || !row) {
      sendJson(res, 404, { error: 'Клип не найден' })
      return
    }
    if (String(row.club_id) !== clubId) {
      sendJson(res, 403, { error: 'Клип другого клуба' })
      return
    }
    if (normalizeSaleClipStatus(row.status) === 'done') {
      sendJson(res, 400, { error: 'Клип уже подтверждён на планшете — отменить нельзя' })
      return
    }
    const now = new Date().toISOString()
    const { data: updated, error } = await ctx.supabaseAdmin
      .from('sale_clips')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', id)
      .select(CLIP_SELECT)
      .maybeSingle()
    if (error) {
      sendJson(res, 400, { error: error.message || 'Не удалось отменить' })
      return
    }
    sendJson(res, 200, { clip: updated, reason: 'Клип отменён' })
    return
  }

  if (op !== 'create') {
    sendJson(res, 400, { error: 'Неизвестная операция' })
    return
  }

  const { data: clubClients, error: cErr } = await ctx.supabaseAdmin
    .from('clients')
    .select('id, name, phone, card_number, trainer_id, club_id, lifecycle, archived_at, pnk_stage')
    .eq('club_id', clubId)
    .is('archived_at', null)
    .limit(5000)
  if (cErr) {
    sendJson(res, 400, { error: cErr.message || 'Не удалось загрузить клиентов' })
    return
  }

  const clients = clubClients ?? []
  const clientIds = clients.map((c) => c.id).filter(Boolean)
  /** @type {Record<string, object[]>} */
  const membershipsByClientId = {}
  if (clientIds.length) {
    const { data: mems } = await ctx.supabaseAdmin
      .from('memberships')
      .select('id, client_id, start_date, end_date, total_trainings, used_trainings, status')
      .in('client_id', clientIds.slice(0, 800))
    for (const m of mems ?? []) {
      const cid = String(m.client_id)
      if (!membershipsByClientId[cid]) membershipsByClientId[cid] = []
      membershipsByClientId[cid].push(m)
    }
  }

  const plan = planSaleClipCreate({
    clients,
    membershipsByClientId,
    draft: { ...body, club_id: clubId },
  })
  if (!plan.ok) {
    sendJson(res, 400, { error: plan.reason, reason: plan.reason, warnings: plan.warnings, match: plan.match })
    return
  }

  const { data: trainer } = await ctx.supabaseAdmin
    .from('users')
    .select('id, name, club_id, is_system_placeholder, role')
    .eq('id', plan.clip.trainer_id)
    .maybeSingle()
  if (!trainer || String(trainer.club_id ?? '') !== clubId) {
    sendJson(res, 400, { error: 'Тренер не найден в этом клубе', reason: 'Тренер не найден в этом клубе' })
    return
  }
  if (isHoldingTrainerUser(trainer)) {
    sendJson(res, 400, {
      error: 'Для клипа нужен реальный тренер, не «Не назначен»',
      reason: 'Для клипа нужен реальный тренер, не «Не назначен»',
    })
    return
  }

  let clientId = plan.clip.client_id
  const now = new Date().toISOString()

  if (!clientId) {
    const newId = crypto.randomUUID()
    const insertClient = {
      id: newId,
      name: plan.clip.client_name,
      phone: plan.clip.phone,
      card_number: plan.clip.card_number,
      birth_date: plan.clip.birth_date,
      trainer_id: plan.clip.trainer_id,
      club_id: clubId,
      lifecycle: 'active',
      created_at: now,
    }
    const { error: insErr } = await ctx.supabaseAdmin.from('clients').insert(insertClient)
    if (insErr) {
      sendJson(res, 400, {
        error: insErr.message || 'Не удалось создать клиента',
        reason: insErr.message || 'Не удалось создать клиента',
      })
      return
    }
    clientId = newId
  } else {
    const existing = clients.find((c) => String(c.id) === String(clientId))
    const patch = { updated_at: now }
    if (plan.match?.fillCard) patch.card_number = plan.match.fillCard
    if (isOpenPnkClient(existing)) {
      patch.lifecycle = 'active'
      patch.pnk_won_at = now
      patch.pnk_stage = 'won'
    }
    if (existing && String(existing.trainer_id) !== String(plan.clip.trainer_id)) {
      // Не сбрасываем на другого без явного — но клип задаёт тренера для заявки; карточку не трогаем trainer_id если уже есть реальный.
      // Только если ПНК promote — можно оставить текущего; иначе не меняем trainer.
    }
    if (Object.keys(patch).length > 1) {
      await ctx.supabaseAdmin.from('clients').update(patch).eq('id', clientId)
    }
  }

  const row = {
    ...plan.clip,
    client_id: clientId,
    created_by: ctx.user?.id ?? null,
    created_at: now,
    updated_at: now,
  }

  const { data: created, error } = await ctx.supabaseAdmin
    .from('sale_clips')
    .insert(row)
    .select(CLIP_SELECT)
    .maybeSingle()
  if (error) {
    sendJson(res, 400, {
      error: error.message || 'Не сохранилось: клип не создан',
      reason: error.message || 'Не сохранилось: клип не создан',
    })
    return
  }

  sendJson(res, 200, {
    clip: created,
    warnings: plan.warnings,
    reason: 'Клип создан — ждём планшет',
    match: plan.match
      ? { status: plan.match.status, matchedBy: plan.match.matchedBy, reason: plan.match.reason }
      : null,
  })
}
