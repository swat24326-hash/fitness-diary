import { sendJson } from './adminSupabase.js'
import { adminDeleteUser, adminUpdatePassword } from './authPort.js'
import {
  assertTrainerDeletableByClientCount,
  parseTrainerIdForAdmin,
  validateTrainerNameForAdmin,
  validateTrainerPasswordForAdmin,
} from '../../src/lib/admin/trainerAuthAdminCore.js'

const TRAINER_ROLES = ['trainer', 'тренер']

function isTrainerRole(role) {
  return TRAINER_ROLES.includes(String(role ?? '').trim().toLowerCase())
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} trainerId
 */
async function loadTrainerRow(supabaseAdmin, trainerId) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, role, name, login, is_active')
    .eq('id', trainerId)
    .maybeSingle()
  if (error) return { row: null, error: error.message }
  if (!data || !isTrainerRole(data.role)) {
    return { row: null, error: 'Тренер не найден' }
  }
  return { row: data, error: null }
}

/**
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient }} ctx
 * @param {import('http').ServerResponse} res
 * @param {Record<string, unknown>} body
 */
export async function handleResetTrainerPasswordPost(ctx, res, body) {
  const parsed = parseTrainerIdForAdmin(body?.trainer_id)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  const passCheck = validateTrainerPasswordForAdmin(body?.password)
  if (!passCheck.ok) {
    sendJson(res, 400, { error: passCheck.error })
    return
  }

  const { row, error: loadErr } = await loadTrainerRow(ctx.supabaseAdmin, parsed.id)
  if (loadErr) {
    sendJson(res, 400, { error: loadErr })
    return
  }

  const { error: authErr } = await adminUpdatePassword(ctx.supabaseAdmin, parsed.id, String(body.password))
  if (authErr) {
    sendJson(res, 400, { error: authErr })
    return
  }

  sendJson(res, 200, {
    ok: true,
    trainer_id: parsed.id,
    name: row.name ?? null,
    login: row.login ?? null,
  })
}

/**
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient }} ctx
 * @param {import('http').ServerResponse} res
 * @param {Record<string, unknown>} body
 */
export async function handleSetTrainerActivePost(ctx, res, body) {
  const parsed = parseTrainerIdForAdmin(body?.trainer_id)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  const isActive = body?.is_active !== false

  const { row, error: loadErr } = await loadTrainerRow(ctx.supabaseAdmin, parsed.id)
  if (loadErr) {
    sendJson(res, 400, { error: loadErr })
    return
  }

  const { error: updErr } = await ctx.supabaseAdmin
    .from('users')
    .update({ is_active: isActive })
    .eq('id', parsed.id)
    .in('role', TRAINER_ROLES)

  if (updErr) {
    sendJson(res, 400, { error: updErr.message })
    return
  }

  sendJson(res, 200, {
    ok: true,
    trainer_id: parsed.id,
    is_active: isActive,
    name: row.name ?? null,
  })
}

/**
 * Смена ФИО тренера в public.users (логин / Auth не трогаем).
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient }} ctx
 * @param {import('http').ServerResponse} res
 * @param {Record<string, unknown>} body
 */
export async function handleSetTrainerNamePost(ctx, res, body) {
  const parsed = parseTrainerIdForAdmin(body?.trainer_id)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  const nameCheck = validateTrainerNameForAdmin(body?.name)
  if (!nameCheck.ok) {
    sendJson(res, 400, { error: nameCheck.error })
    return
  }

  const { row, error: loadErr } = await loadTrainerRow(ctx.supabaseAdmin, parsed.id)
  if (loadErr) {
    sendJson(res, 400, { error: loadErr })
    return
  }

  const { error: updErr } = await ctx.supabaseAdmin
    .from('users')
    .update({ name: nameCheck.name })
    .eq('id', parsed.id)
    .in('role', TRAINER_ROLES)

  if (updErr) {
    sendJson(res, 400, { error: updErr.message })
    return
  }

  sendJson(res, 200, {
    ok: true,
    trainer_id: parsed.id,
    name: nameCheck.name,
    previous_name: row.name ?? null,
  })
}

/**
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient }} ctx
 * @param {import('http').ServerResponse} res
 * @param {Record<string, unknown>} body
 */
export async function handleSetTrainerUsesTabletPost(ctx, res, body) {
  const parsed = parseTrainerIdForAdmin(body?.trainer_id)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  if (body?.uses_tablet === undefined || body?.uses_tablet === null) {
    sendJson(res, 400, { error: 'Укажите uses_tablet: true или false' })
    return
  }
  const usesTablet = body.uses_tablet === true || body.uses_tablet === 'true'

  const { row, error: loadErr } = await loadTrainerRow(ctx.supabaseAdmin, parsed.id)
  if (loadErr) {
    sendJson(res, 400, { error: loadErr })
    return
  }

  const { error: updErr } = await ctx.supabaseAdmin
    .from('users')
    .update({ uses_tablet: usesTablet })
    .eq('id', parsed.id)
    .in('role', TRAINER_ROLES)

  if (updErr) {
    sendJson(res, 400, { error: updErr.message })
    return
  }

  sendJson(res, 200, {
    ok: true,
    trainer_id: parsed.id,
    uses_tablet: usesTablet,
    name: row.name ?? null,
  })
}

/**
 * Удаление тренера из Auth + public.users (только без клиентов).
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient }} ctx
 * @param {import('http').ServerResponse} res
 * @param {Record<string, unknown>} body
 */
export async function handleDeleteTrainerPost(ctx, res, body) {
  const parsed = parseTrainerIdForAdmin(body?.trainer_id)
  if (!parsed.ok) {
    sendJson(res, 400, { error: parsed.error })
    return
  }

  const { count, error: cntErr } = await ctx.supabaseAdmin
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('trainer_id', parsed.id)

  if (cntErr) {
    sendJson(res, 400, { error: cntErr.message })
    return
  }

  const deletable = assertTrainerDeletableByClientCount(count ?? 0)
  if (!deletable.ok) {
    sendJson(res, 400, { error: deletable.error })
    return
  }

  const { row, error: loadErr } = await loadTrainerRow(ctx.supabaseAdmin, parsed.id)
  if (loadErr) {
    sendJson(res, loadErr === 'Тренер не найден' ? 404 : 400, { error: loadErr })
    return
  }

  const { error: delUserRow } = await ctx.supabaseAdmin
    .from('users')
    .delete()
    .eq('id', parsed.id)
    .in('role', TRAINER_ROLES)
  if (delUserRow) {
    sendJson(res, 400, { error: delUserRow.message })
    return
  }

  const { error: delAuth } = await adminDeleteUser(ctx.supabaseAdmin, parsed.id)
  if (delAuth) {
    sendJson(res, 400, { error: delAuth })
    return
  }

  sendJson(res, 200, {
    ok: true,
    trainer_id: parsed.id,
    name: row.name ?? null,
  })
}
