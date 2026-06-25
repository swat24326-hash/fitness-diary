/**
 * Абонементы всех клиентов клуба (для админки, service role).
 * GET ?club_id=<uuid>
 */
import { requireAdmin, sendJson, setCors } from './_lib/adminSupabase.js'

const PAGE = 500
const IN_CHUNK = 80

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

  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  const rawClub = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  if (
    !rawClub ||
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(rawClub)
  ) {
    sendJson(res, 400, { error: 'Укажите club_id (UUID клуба)' })
    return
  }

  const { supabaseAdmin } = ctx
  const clientIds = []
  let from = 0

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('club_id', rawClub)
      .range(from, from + PAGE - 1)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    const rows = data ?? []
    for (const r of rows) {
      if (r?.id) clientIds.push(r.id)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }

  const memberships = []
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue
    const { data, error } = await supabaseAdmin.from('memberships').select('*').in('client_id', chunk)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    memberships.push(...(data ?? []))
  }

  sendJson(res, 200, { memberships, count: memberships.length, club_id: rawClub })
}
