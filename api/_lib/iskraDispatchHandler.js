import { sendJson } from './adminSupabase.js'
import { isSalesManagerRole } from '../../src/lib/admin/salesAccessCore.js'
import {
  canTransitionDispatchStatus,
  formatDispatchForUi,
  ISKRA_DISPATCH_ACTIVE_STATUSES,
  normalizeDispatchCreatePayload,
  normalizeDispatchDeletePayload,
  normalizeRecipientUserIds,
} from '../../src/lib/admin/iskraDispatchCore.js'

const TRAINER_ROLES = new Set(['trainer', 'тренер'])

const DISPATCH_SELECT =
  'id, club_id, sender_user_id, recipient_user_id, kind, status, title, body, source, source_channel, context_json, insight_key, task_kind, priority, due_at, deep_link, period_year, period_month, created_at, updated_at, seen_at, accepted_at, completed_at, declined_at, recipient_reply'

function isTrainerRole(role) {
  return TRAINER_ROLES.has(String(role ?? '').trim().toLowerCase())
}

/**
 * @param {string} role
 * @param {string} taskKind
 */
function isDispatchRecipientRole(role, taskKind) {
  if (isTrainerRole(role)) return true
  if (isSalesManagerRole(role) && String(taskKind ?? '') === 'daily_report') return true
  return false
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string[]} userIds
 */
async function loadUserNames(supabaseAdmin, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const { data } = await supabaseAdmin.from('users').select('id, name').in('id', ids)
  return new Map((data ?? []).map((u) => [String(u.id), String(u.name ?? '').trim()]))
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {object} ctx
 */
async function resolveDispatchSenderUserId(supabaseAdmin, ctx) {
  const profileId = String(ctx.profile?.id ?? '').trim()
  if (profileId) {
    const { data } = await supabaseAdmin.from('users').select('id').eq('id', profileId).maybeSingle()
    if (data?.id) return profileId
  }

  const authId = String(ctx.user?.id ?? '').trim()
  if (authId) {
    const { data } = await supabaseAdmin.from('users').select('id').eq('id', authId).maybeSingle()
    if (data?.id) return authId
  }

  const email = String(ctx.user?.email ?? ctx.profile?.email ?? '').trim().toLowerCase()
  if (email) {
    const { data } = await supabaseAdmin.from('users').select('id').ilike('email', email).maybeSingle()
    if (data?.id) return String(data.id)
  }

  if (!ctx.isAdmin || !authId) return null

  const loginBase = email.includes('@') ? email.split('@')[0] : 'admin'
  const row = {
    id: authId,
    name: String(ctx.profile?.name ?? 'Администратор').trim() || 'Администратор',
    email: email || 'admin@fit-city.ru',
    login: loginBase || 'admin',
    role: 'admin',
    password_hash: 'supabase-auth',
    is_active: true,
    club_id: null,
  }
  const { error } = await supabaseAdmin.from('users').upsert(row, { onConflict: 'id' })
  if (!error) return authId

  if (email) {
    const { data } = await supabaseAdmin.from('users').select('id').ilike('email', email).maybeSingle()
    if (data?.id) return String(data.id)
  }

  return null
}

/**
 * @param {object} ctx
 * @param {object} req
 * @param {object} res
 */
export async function handleIskraDispatchGet(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const view = String(req.query?.view ?? 'inbox').trim().toLowerCase()
  const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 30))

  if (!clubId && view === 'sent' && !ctx.isAdmin) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  try {
    let query = ctx.supabaseAdmin
      .from('club_iskra_dispatch')
      .select(DISPATCH_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (view === 'sent') {
      if (!ctx.isAdmin) {
        sendJson(res, 403, { error: 'Только администратор' })
        return
      }
      if (!clubId) {
        sendJson(res, 400, { error: 'Укажите club_id' })
        return
      }
      query = query.eq('club_id', clubId)
    } else {
      query = query.eq('recipient_user_id', ctx.user.id)
      if (clubId) query = query.eq('club_id', clubId)
    }

    const status = String(req.query?.status ?? '').trim()
    if (status && ['pending', 'seen', 'accepted', 'done', 'dismissed', 'declined'].includes(status)) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) {
      if (/does not exist|relation.*club_iskra_dispatch/i.test(String(error.message ?? ''))) {
        sendJson(res, 200, { ok: true, items: [], pending_count: 0, migration_pending: true })
        return
      }
      throw error
    }

    const rows = data ?? []
    const names = await loadUserNames(
      ctx.supabaseAdmin,
      rows.flatMap((r) => [r.sender_user_id, r.recipient_user_id]),
    )
    const items = rows.map((r) =>
      formatDispatchForUi({
        ...r,
        sender_name: names.get(String(r.sender_user_id)) || 'ИСКРА',
        recipient_name: names.get(String(r.recipient_user_id)) || '',
      }),
    )
    const activeCount = items.filter((i) => ISKRA_DISPATCH_ACTIVE_STATUSES.includes(i.status)).length

    sendJson(res, 200, {
      ok: true,
      view,
      items,
      pending_count: activeCount,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка загрузки сообщений' })
  }
}

/**
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
export async function handleIskraDispatchPost(ctx, res, body) {
  const op = String(body?.op ?? 'create').trim().toLowerCase()

  if (op === 'update_status') {
    return handleIskraDispatchStatusUpdate(ctx, res, body)
  }
  if (op === 'mark_seen') {
    return handleIskraDispatchMarkSeen(ctx, res, body)
  }
  if (op === 'delete') {
    return handleIskraDispatchDelete(ctx, res, body)
  }

  if (!ctx.isAdmin) {
    sendJson(res, 403, { error: 'Отправлять задачи может только администратор' })
    return
  }

  const normalized = normalizeDispatchCreatePayload(body)
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error })
    return
  }

  const recipientIds = normalizeRecipientUserIds(body)
  if (!recipientIds.ok) {
    sendJson(res, 400, { error: recipientIds.error })
    return
  }

  const p = normalized.payload

  try {
    const senderUserId = await resolveDispatchSenderUserId(ctx.supabaseAdmin, ctx)
    if (!senderUserId) {
      sendJson(res, 400, {
        error:
          'Профиль администратора не найден в базе. Выйдите и войдите снова; если не поможет — проверьте users.id в Supabase.',
      })
      return
    }

    const now = new Date().toISOString()
    const created = []
    const errors = []

    for (const recipientUserId of recipientIds.ids) {
      const rowResult = await insertDispatchRow(ctx, {
        payload: { ...p, recipient_user_id: recipientUserId },
        senderUserId,
        now,
      })
      if (rowResult.ok) created.push(rowResult.item)
      else errors.push(rowResult.error)
    }

    if (!created.length) {
      sendJson(res, 400, { error: errors[0] ?? 'Не удалось поставить задание' })
      return
    }

    sendJson(res, 200, {
      ok: true,
      stored: true,
      count: created.length,
      item: created[0],
      items: created,
      errors: errors.length ? errors : undefined,
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка отправки' })
  }
}

/**
 * @param {object} ctx
 * @param {{ payload: object, senderUserId: string, now: string }} opts
 */
async function insertDispatchRow(ctx, { payload: p, senderUserId, now }) {
  try {
    const { data: recipient, error: recErr } = await ctx.supabaseAdmin
      .from('users')
      .select('id, role, club_id, is_active')
      .eq('id', p.recipient_user_id)
      .maybeSingle()
    if (recErr) throw recErr
    if (!recipient || !isDispatchRecipientRole(recipient.role, p.task_kind)) {
      return {
        ok: false,
        error:
          p.task_kind === 'daily_report'
            ? 'Получатель должен быть тренером или менеджером по продажам'
            : 'Получатель должен быть тренером клуба',
      }
    }
    if (recipient.is_active === false) {
      return { ok: false, error: 'Тренер неактивен' }
    }
    if (String(recipient.club_id ?? '') !== p.club_id) {
      return { ok: false, error: 'Тренер из другого клуба' }
    }

    const row = {
      club_id: p.club_id,
      sender_user_id: senderUserId,
      recipient_user_id: p.recipient_user_id,
      kind: p.kind,
      status: 'pending',
      title: p.title,
      body: p.body,
      source: p.source,
      source_channel: p.source_channel,
      context_json: p.context_json,
      insight_key: p.insight_key,
      task_kind: p.task_kind,
      priority: p.priority,
      due_at: p.due_at,
      deep_link: p.deep_link,
      period_year: p.period_year,
      period_month: p.period_month,
      updated_at: now,
    }

    const { data, error } = await ctx.supabaseAdmin
      .from('club_iskra_dispatch')
      .insert(row)
      .select(DISPATCH_SELECT)
      .maybeSingle()

    if (error) {
      if (/sender_user_id_fkey|foreign key constraint.*sender_user_id/i.test(String(error.message ?? ''))) {
        return { ok: false, error: 'Профиль администратора не связан с базой клуба. Выйдите и войдите снова.' }
      }
      if (/does not exist|relation.*club_iskra_dispatch/i.test(String(error.message ?? ''))) {
        return { ok: false, error: 'migration_pending' }
      }
      throw error
    }

    return { ok: true, item: formatDispatchForUi({ ...data, sender_name: 'ИСКРА' }) }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : 'Ошибка отправки' }
  }
}

/**
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
async function handleIskraDispatchDelete(ctx, res, body) {
  if (!ctx.isAdmin) {
    sendJson(res, 403, { error: 'Удалять задания может только администратор' })
    return
  }

  const normalized = normalizeDispatchDeletePayload(body)
  if (!normalized.ok) {
    sendJson(res, 400, { error: normalized.error })
    return
  }

  try {
    const { data: existing, error: loadErr } = await ctx.supabaseAdmin
      .from('club_iskra_dispatch')
      .select('id, club_id')
      .eq('id', normalized.dispatch_id)
      .maybeSingle()

    if (loadErr) throw loadErr
    if (!existing) {
      sendJson(res, 404, { error: 'Задание не найдено' })
      return
    }
    if (normalized.club_id && String(existing.club_id) !== normalized.club_id) {
      sendJson(res, 400, { error: 'Задание из другого клуба' })
      return
    }

    const { error } = await ctx.supabaseAdmin
      .from('club_iskra_dispatch')
      .delete()
      .eq('id', normalized.dispatch_id)

    if (error) {
      if (/does not exist|relation.*club_iskra_dispatch/i.test(String(error.message ?? ''))) {
        sendJson(res, 200, { ok: false, deleted: false, reason: 'migration_pending' })
        return
      }
      throw error
    }

    sendJson(res, 200, { ok: true, deleted: true, dispatch_id: normalized.dispatch_id })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка удаления' })
  }
}

/**
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
async function handleIskraDispatchStatusUpdate(ctx, res, body) {
  const id = String(body?.dispatch_id ?? body?.id ?? '').trim()
  const status = String(body?.status ?? '').trim()
  const reply = String(body?.recipient_reply ?? '').trim().slice(0, 500)

  if (!id) {
    sendJson(res, 400, { error: 'Укажите dispatch_id' })
    return
  }

  try {
    const { data: existing, error: loadErr } = await ctx.supabaseAdmin
      .from('club_iskra_dispatch')
      .select('id, recipient_user_id, status, seen_at')
      .eq('id', id)
      .maybeSingle()

    if (loadErr) throw loadErr
    if (!existing) {
      sendJson(res, 404, { error: 'Сообщение не найдено' })
      return
    }

    const isRecipient = String(existing.recipient_user_id) === String(ctx.user.id)
    if (!isRecipient && !ctx.isAdmin) {
      sendJson(res, 403, { error: 'Нет доступа' })
      return
    }

    if (!canTransitionDispatchStatus(existing.status, status)) {
      sendJson(res, 400, { error: `Нельзя сменить статус ${existing.status} → ${status}` })
      return
    }

    const now = new Date().toISOString()
    const patch = {
      status,
      updated_at: now,
    }
    if (status === 'seen' && !existing.seen_at) patch.seen_at = now
    if (status === 'accepted') patch.accepted_at = now
    if (status === 'done') patch.completed_at = now
    if (status === 'declined') {
      patch.declined_at = now
      if (reply) patch.recipient_reply = reply
    }

    const { data, error } = await ctx.supabaseAdmin
      .from('club_iskra_dispatch')
      .update(patch)
      .eq('id', id)
      .select('id, status, seen_at, accepted_at, completed_at, declined_at, recipient_reply, updated_at')
      .maybeSingle()

    if (error) throw error

    sendJson(res, 200, { ok: true, item: data })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка обновления' })
  }
}

/**
 * @param {object} ctx
 * @param {object} res
 * @param {object} body
 */
async function handleIskraDispatchMarkSeen(ctx, res, body) {
  const ids = Array.isArray(body?.dispatch_ids)
    ? body.dispatch_ids.map((x) => String(x).trim()).filter(Boolean)
    : []
  const id = String(body?.dispatch_id ?? '').trim()
  const allIds = id ? [...ids, id] : ids

  if (!allIds.length) {
    sendJson(res, 400, { error: 'Укажите dispatch_id или dispatch_ids' })
    return
  }

  try {
    const now = new Date().toISOString()
    const { data, error } = await ctx.supabaseAdmin
      .from('club_iskra_dispatch')
      .update({ status: 'seen', seen_at: now, updated_at: now })
      .eq('recipient_user_id', ctx.user.id)
      .eq('status', 'pending')
      .in('id', allIds)
      .select('id, status')

    if (error) throw error

    sendJson(res, 200, { ok: true, updated: (data ?? []).length })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка mark_seen' })
  }
}
