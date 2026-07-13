/**
 * Vercel: список тренеров для админки (обход ERR_CONNECTION_RESET браузер → Supabase).
 */
import { canAccessTrainerOrAdminApis, requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { LIST_TRAINERS_MAX_USERS } from './_lib/apiLimits.js'
import { isSalesManagerRole } from '../src/lib/admin/salesAccessCore.js'
import { isQaAutoUser } from '../src/lib/admin/qaAutoUserCore.js'

const TRAINER_FIELDS = 'id, name, phone, email, login, is_active, role, club_id'
const PAGE = 500

function isTrainerRole(role) {
  const r = String(role ?? '').trim().toLowerCase()
  return r === 'trainer' || r === 'тренер'
}

async function fetchUsersPaged(supabaseAdmin, fields) {
  const rows = []
  let from = 0
  for (;;) {
    if (rows.length >= LIST_TRAINERS_MAX_USERS) break
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(fields)
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { error, rows: null }
    const chunk = data ?? []
    const room = LIST_TRAINERS_MAX_USERS - rows.length
    rows.push(...chunk.slice(0, room))
    if (chunk.length < PAGE || rows.length >= LIST_TRAINERS_MAX_USERS) break
    from += PAGE
  }
  return { error: null, rows }
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

  const full = await fetchUsersPaged(supabaseAdmin, TRAINER_FIELDS)

  if (!full.error) {
    const trainers = (full.rows ?? []).filter(
      (u) => !isQaAutoUser(u) && (wantSalesManagers ? isSalesManagerRole(u.role) : isTrainerRole(u.role)),
    )
    sendJson(res, 200, {
      trainers,
      clubColumn: true,
      count: trainers.length,
      truncated: (full.rows?.length ?? 0) >= LIST_TRAINERS_MAX_USERS,
    })
    return
  }

  const msg = String(full.error.message ?? '').toLowerCase()
  if (!msg.includes('club_id')) {
    sendJson(res, 400, { error: full.error.message })
    return
  }

  const basic = await fetchUsersPaged(supabaseAdmin, 'id, name, phone, email, login, is_active, role')

  if (basic.error) {
    sendJson(res, 400, { error: basic.error.message })
    return
  }

  const trainers = (basic.rows ?? [])
    .filter((u) => !isQaAutoUser(u) && (wantSalesManagers ? isSalesManagerRole(u.role) : isTrainerRole(u.role)))
    .map((u) => ({ ...u, club_id: null }))
  sendJson(res, 200, {
    trainers,
    clubColumn: false,
    count: trainers.length,
    truncated: (basic.rows?.length ?? 0) >= LIST_TRAINERS_MAX_USERS,
  })
}

export default withSafeApiHandler(handler, { label: 'list-trainers' })
