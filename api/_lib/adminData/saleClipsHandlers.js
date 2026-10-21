/**
 * API: admin-data?action=sale-clips — список / создание / отмена клип-карт.
 */
import { sendJson } from '../adminSupabase.js'
import { planSaleClipCreate, normalizeSaleClipStatus } from '../../../src/lib/admin/saleClipCore.js'
import { matchClientByCardThenPhone } from '../../../src/lib/admin/salesClientMatchCore.js'
import { isHoldingTrainerUser } from '../../../src/lib/admin/deskClosingImportCore.js'
import { isClientArchived } from '../../../src/lib/clientArchive.js'
import { fetchClubClientCandidates } from '../salesClientLookup.js'
import {
  cancelInstantSaleClip,
  commitInstantSaleClip,
  updateInstantSaleClipMembership,
} from '../saleClipInstantWrite.js'
import { notifyTrainerSaleClipCreated } from '../saleClipTrainerNotify.js'

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
  let clips = data ?? []
  if (!status || status === 'awaiting') {
    try {
      const { reconcileAndFilterAwaitingSaleClips } = await import('../saleClipsReconcile.js')
      const awaiting = clips.filter((c) => normalizeSaleClipStatus(c?.status) === 'awaiting')
      const others = clips.filter((c) => normalizeSaleClipStatus(c?.status) !== 'awaiting')
      const kept = await reconcileAndFilterAwaitingSaleClips(ctx.supabaseAdmin, awaiting)
      clips = status === 'awaiting' ? kept : [...kept, ...others]
    } catch {
      /* reconcile best-effort */
    }
  }
  sendJson(res, 200, { clips })
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
    const { data: clubClients, error: cErr } = await fetchClubClientCandidates(ctx.supabaseAdmin, {
      clubId,
      cardNumber: card,
      phone,
      select: 'id, name, phone, card_number, trainer_id, club_id, lifecycle, archived_at',
      activeOnly: true,
    })
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
    const result = await cancelInstantSaleClip(ctx.supabaseAdmin, {
      clubId,
      clipId: id,
      isAdmin: ctx.isAdmin === true,
    })
    sendJson(res, result.status, result.body)
    return
  }

  if (op === 'update-membership') {
    const id = String(body.id ?? body.clip_id ?? '').trim()
    if (!id) {
      sendJson(res, 400, { error: 'Укажите id клипа' })
      return
    }
    const result = await updateInstantSaleClipMembership(ctx.supabaseAdmin, {
      clubId,
      clipId: id,
      startDate: body.start_date,
      endDate: body.end_date,
      totalTrainings: body.total_trainings,
    })
    sendJson(res, result.status, result.body)
    return
  }

  if (op !== 'create') {
    sendJson(res, 400, { error: 'Неизвестная операция' })
    return
  }

  const { data: clubClients, error: cErr } = await fetchClubClientCandidates(ctx.supabaseAdmin, {
    clubId,
    cardNumber: body.card_number,
    phone: body.phone,
    select: 'id, name, phone, card_number, trainer_id, club_id, lifecycle, archived_at, pnk_stage',
  })
  if (cErr) {
    sendJson(res, 400, { error: cErr.message || 'Не удалось загрузить клиентов' })
    return
  }

  const allClubClients = clubClients ?? []
  const clients = allClubClients.filter((c) => !isClientArchived(c))
  const clientIds = clients.map((c) => c.id).filter(Boolean)
  /** @type {Record<string, object[]>} */
  const membershipsByClientId = {}
  if (clientIds.length) {
    const { data: mems } = await ctx.supabaseAdmin
      .from('memberships')
      .select('id, client_id, start_date, end_date, total_trainings, used_trainings, status')
      .in('client_id', clientIds)
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

  const result = await commitInstantSaleClip(ctx.supabaseAdmin, {
    clubId,
    body,
    plan,
    allClubClients,
    clients,
    createdBy: ctx.user?.id ?? null,
  })
  if (result.status === 200 && result.body?.clip?.trainer_id) {
    const clip = result.body.clip
    const clientId = String(clip.client_id ?? '')
    try {
      await notifyTrainerSaleClipCreated(ctx.supabaseAdmin, {
        trainerId: clip.trainer_id,
        clip,
        membership: result.body.membership,
        client: clients.find((c) => String(c.id) === clientId) ?? null,
        priorMemberships: membershipsByClientId[clientId] ?? [],
      })
    } catch (e) {
      console.warn('[sale-clip-push]', e?.message || e)
    }
  }
  sendJson(res, result.status, result.body)
}
