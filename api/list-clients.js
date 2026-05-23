/**
 * Список клиентов клуба для админки (service role, без ERR_CONNECTION_RESET в браузере).
 * GET ?club_id=<uuid>
 */
import { requireAdmin, sendJson, setCors } from './lib/adminSupabase.js'

const PAGE = 500

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
  const all = []
  let from = 0

  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('club_id', rawClub)
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }

    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  sendJson(res, 200, { clients: all, count: all.length, club_id: rawClub })
}
