/**
 * Vercel: список тренеров для админки (обход ERR_CONNECTION_RESET браузер → Supabase).
 */
import { canAccessTrainerOrAdminApis, requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { isSalesManagerRole } from '../src/lib/admin/salesAccessCore.js'

const TRAINER_FIELDS = 'id, name, phone, email, login, is_active, role, club_id'

function isTrainerRole(role) {
  const r = String(role ?? '').trim().toLowerCase()
  return r === 'trainer' || r === 'тренер'
}

export default async function handler(req, res) {
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

  const roleFilter = String(req.query?.role ?? '').trim().toLowerCase()
  const wantSalesManagers = roleFilter === 'sales_manager'

  if (wantSalesManagers) {
    if (!ctx.isAdmin) {
      sendJson(res, 403, { error: 'Только администратор' })
      return
    }
  } else if (!canAccessTrainerOrAdminApis(ctx)) {
    sendJson(res, 403, { error: 'Только администратор или тренер' })
    return
  }

  const { supabaseAdmin } = ctx

  const full = await supabaseAdmin
    .from('users')
    .select(TRAINER_FIELDS)
    .order('name', { ascending: true })

  if (!full.error) {
    const trainers = (full.data ?? []).filter((u) =>
      wantSalesManagers ? isSalesManagerRole(u.role) : isTrainerRole(u.role),
    )
    sendJson(res, 200, {
      trainers,
      clubColumn: true,
      count: trainers.length,
    })
    return
  }

  const msg = String(full.error.message ?? '').toLowerCase()
  if (!msg.includes('club_id')) {
    sendJson(res, 400, { error: full.error.message })
    return
  }

  const basic = await supabaseAdmin
    .from('users')
    .select('id, name, phone, email, login, is_active, role')
    .order('name', { ascending: true })

  if (basic.error) {
    sendJson(res, 400, { error: basic.error.message })
    return
  }

  const trainers = (basic.data ?? [])
    .filter((u) => (wantSalesManagers ? isSalesManagerRole(u.role) : isTrainerRole(u.role)))
    .map((u) => ({ ...u, club_id: null }))
  sendJson(res, 200, { trainers, clubColumn: false, count: trainers.length })
}
