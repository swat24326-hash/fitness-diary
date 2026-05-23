/**
 * Админ: привязать тренера к клубу (users.club_id) через service role.
 */
import { requireAdmin, sendJson, setCors } from './lib/adminSupabase.js'

const TRAINER_ROLES = ['trainer', 'тренер']

function isTrainerRole(role) {
  const r = String(role ?? '').trim().toLowerCase()
  return TRAINER_ROLES.includes(r)
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON' })
      return
    }
  }

  const trainerId = String(body?.trainer_id ?? body?.trainerId ?? '').trim()
  const rawClub = body?.club_id != null ? String(body.club_id).trim() : ''
  const club_id =
    rawClub && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(rawClub)
      ? rawClub
      : null

  if (!trainerId) {
    sendJson(res, 400, { error: 'Не указан тренер' })
    return
  }
  if (!club_id) {
    sendJson(res, 400, { error: 'Выберите клуб' })
    return
  }

  const { supabaseAdmin } = ctx
  const victim = await supabaseAdmin.from('users').select('id, role').eq('id', trainerId).maybeSingle()
  if (victim.error) {
    sendJson(res, 400, { error: victim.error.message })
    return
  }
  if (!victim.data || !isTrainerRole(victim.data.role)) {
    sendJson(res, 404, { error: 'Тренер не найден' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ club_id })
    .eq('id', trainerId)
    .select('id, name, phone, email, login, is_active, role, club_id')
    .single()

  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }

  sendJson(res, 200, { ok: true, trainer: data })
}
