/**
 * Список клиентов клуба для админки (service role, без ERR_CONNECTION_RESET в браузере).
 * GET ?club_id=<uuid>
 */
import { requireAdmin, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { LIST_CLIENTS_MAX, LIST_CLIENTS_PAGE_SIZE } from './_lib/apiLimits.js'

const PAGE = LIST_CLIENTS_PAGE_SIZE

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
  const includeArchived = String(req.query?.include_archived ?? req.query?.includeArchived ?? '').trim() === '1'
  const archivedOnly = String(req.query?.archived ?? '').trim() === '1'

  const rawOffset = parseInt(String(req.query?.offset ?? ''), 10)
  const rawLimit = parseInt(String(req.query?.limit ?? ''), 10)
  const paginated =
    Number.isFinite(rawOffset) && rawOffset >= 0 && Number.isFinite(rawLimit) && rawLimit > 0
  const pageOffset = paginated ? rawOffset : 0
  const pageLimit = paginated ? Math.min(rawLimit, PAGE) : PAGE

  if (paginated) {
    let q = supabaseAdmin.from('clients').select('*').eq('club_id', rawClub)
    if (!includeArchived) {
      if (archivedOnly) q = q.not('archived_at', 'is', null)
      else q = q.is('archived_at', null)
    }
    const cappedOffset = Math.min(pageOffset, LIST_CLIENTS_MAX - 1)
    const { data, error } = await q
      .order('name', { ascending: true })
      .range(cappedOffset, cappedOffset + pageLimit - 1)

    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }

    const rows = data ?? []
    const truncated = cappedOffset + rows.length >= LIST_CLIENTS_MAX
    const hasMore = !truncated && rows.length === pageLimit

    sendJson(res, 200, {
      clients: rows,
      count: rows.length,
      club_id: rawClub,
      offset: cappedOffset,
      limit: pageLimit,
      has_more: hasMore,
      truncated,
    })
    return
  }

  const all = []
  let from = 0
  let truncated = false

  for (;;) {
    if (all.length >= LIST_CLIENTS_MAX) {
      truncated = true
      break
    }
    let q = supabaseAdmin.from('clients').select('*').eq('club_id', rawClub)
    if (!includeArchived) {
      if (archivedOnly) q = q.not('archived_at', 'is', null)
      else q = q.is('archived_at', null)
    }
    const { data, error } = await q.order('name', { ascending: true }).range(from, from + PAGE - 1)

    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }

    const rows = data ?? []
    const room = LIST_CLIENTS_MAX - all.length
    if (rows.length > room) {
      all.push(...rows.slice(0, room))
      truncated = true
      break
    }
    all.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  sendJson(res, 200, { clients: all, count: all.length, club_id: rawClub, truncated, has_more: false })
}

export default withSafeApiHandler(handler, { label: 'list-clients' })
