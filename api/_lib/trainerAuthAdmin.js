import { sendJson } from './adminSupabase.js'
import {
  parseTrainerIdForAdmin,
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

  const { error: authErr } = await ctx.supabaseAdmin.auth.admin.updateUserById(parsed.id, {
    password: String(body.password),
  })
  if (authErr) {
    sendJson(res, 400, { error: authErr.message })
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
