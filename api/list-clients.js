/**
 * Список клиентов клуба для админки / менеджера продаж (service role).
 * GET ?club_id=<uuid> — менеджер только свой клуб.
 * Опционально updated_since (ISO) — только изменённые строки (CAPACITY A2).
 */
import { publicDbErrorMessage } from './_lib/dbErrorPublicCore.js'
import { requireAdminOrSalesManager, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { LIST_CLIENTS_MAX, LIST_CLIENTS_PAGE_SIZE } from './_lib/apiLimits.js'
import {
  LIST_CLIENTS_SELECT,
  parseUpdatedSinceQuery,
} from './_lib/adminClientsListSelectCore.js'

const PAGE = LIST_CLIENTS_PAGE_SIZE

function applyArchiveFilter(q, { includeArchived, archivedOnly }) {
  if (includeArchived) return q
  if (archivedOnly) return q.not('archived_at', 'is', null)
  return q.is('archived_at', null)
}

async function loadClientIds(supabaseAdmin, clubId, archiveOpts) {
  const ids = []
  let from = 0
  for (;;) {
    let q = supabaseAdmin.from('clients').select('id').eq('club_id', clubId)
    q = applyArchiveFilter(q, archiveOpts)
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) return { error, ids: null }
    const rows = data ?? []
    for (const r of rows) {
      if (r?.id) ids.push(r.id)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return { error: null, ids }
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

  const rawClub = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  if (
    !rawClub ||
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(rawClub)
  ) {
    sendJson(res, 400, { error: 'Укажите club_id (UUID клуба)' })
    return
  }

  const sinceParsed = parseUpdatedSinceQuery(req.query?.updated_since ?? req.query?.updatedSince)
  if (!sinceParsed.ok) {
    sendJson(res, 400, { error: sinceParsed.error })
    return
  }
  const updatedSince = sinceParsed.since

  const ctx = await requireAdminOrSalesManager(req, res, rawClub)
  if (!ctx) return

  const { supabaseAdmin } = ctx
  const server_time = new Date().toISOString()
  const includeArchived = String(req.query?.include_archived ?? req.query?.includeArchived ?? '').trim() === '1'
  const archivedOnly = String(req.query?.archived ?? '').trim() === '1'
  const archiveOpts = { includeArchived, archivedOnly }

  const rawOffset = parseInt(String(req.query?.offset ?? ''), 10)
  const rawLimit = parseInt(String(req.query?.limit ?? ''), 10)
  const paginated =
    Number.isFinite(rawOffset) && rawOffset >= 0 && Number.isFinite(rawLimit) && rawLimit > 0
  const pageOffset = paginated ? rawOffset : 0
  const pageLimit = paginated ? Math.min(rawLimit, PAGE) : PAGE

  const wantClientIds = !paginated || pageOffset === 0
  let client_ids = null
  if (wantClientIds) {
    const idLoad = await loadClientIds(supabaseAdmin, rawClub, archiveOpts)
    if (idLoad.error) {
      sendJson(res, 400, { error: publicDbErrorMessage(idLoad.error, 'list-clients') })
      return
    }
    client_ids = idLoad.ids
  }

  if (paginated) {
    let q = supabaseAdmin.from('clients').select(LIST_CLIENTS_SELECT).eq('club_id', rawClub)
    q = applyArchiveFilter(q, archiveOpts)
    if (updatedSince) q = q.gt('updated_at', updatedSince)
    const cappedOffset = Math.min(pageOffset, LIST_CLIENTS_MAX - 1)
    const { data, error } = await q
      .order('name', { ascending: true })
      .range(cappedOffset, cappedOffset + pageLimit - 1)

    if (error) {
      sendJson(res, 400, { error: publicDbErrorMessage(error, 'list-clients') })
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
      server_time,
      ...(client_ids ? { client_ids } : {}),
      ...(updatedSince ? { updated_since: updatedSince } : {}),
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
    let q = supabaseAdmin.from('clients').select(LIST_CLIENTS_SELECT).eq('club_id', rawClub)
    q = applyArchiveFilter(q, archiveOpts)
    if (updatedSince) q = q.gt('updated_at', updatedSince)
    const { data, error } = await q.order('name', { ascending: true }).range(from, from + PAGE - 1)

    if (error) {
      sendJson(res, 400, { error: publicDbErrorMessage(error, 'list-clients') })
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

  sendJson(res, 200, {
    clients: all,
    count: all.length,
    club_id: rawClub,
    truncated,
    has_more: false,
    server_time,
    client_ids: client_ids ?? [],
    ...(updatedSince ? { updated_since: updatedSince } : {}),
  })
}

export default withSafeApiHandler(handler, { label: 'list-clients' })
