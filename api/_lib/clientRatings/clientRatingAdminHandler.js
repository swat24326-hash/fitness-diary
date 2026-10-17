/**
 * admin-data?action=client-ratings — список и деталь оценок. Админ (все) / управляющий (свой клуб).
 * GET view=list | detail&id=
 */
import { sendJson } from '../adminSupabase.js'
import { INBOX_NO_ACCESS_RU, inboxDeliveryClubFilter } from '../../../src/lib/inbox/inboxAudienceCore.js'
import { publicAdminRatingRow } from '../../../src/lib/client/clientRatingAdminCore.js'
import { isInboxUuid } from '../../../src/lib/inbox/inboxCampaignCore.js'

const SELECT =
  'id, client_id, club_id, kind, membership_id, score, comment, requested_at, answered_at'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function isMissingTable(e) {
  return /client_ratings|does not exist|42P01/i.test(String(e?.message ?? e?.code ?? ''))
}

async function loadClientNames(db, clientIds) {
  const ids = [...new Set((clientIds ?? []).map(String).filter(Boolean))]
  if (!ids.length) return new Map()
  const list = await rows(db.from('clients').select('id, name').in('id', ids))
  return new Map(list.map((c) => [String(c.id), String(c.name || '').trim() || 'Клиент']))
}

async function loadClubNames(db, clubIds) {
  const ids = [...new Set((clubIds ?? []).map(String).filter(Boolean))]
  if (!ids.length) return new Map()
  const list = await rows(db.from('clubs').select('id, name').in('id', ids))
  return new Map(list.map((c) => [String(c.id), String(c.name ?? '').trim()]))
}

function enrich(row, names, clubs) {
  return publicAdminRatingRow({
    ...row,
    client_name: names.get(String(row.client_id)) || 'Клиент',
    club_name: row.club_id ? clubs.get(String(row.club_id)) || null : null,
  })
}

export async function handleClientRatingsAdminGet(ctx, req, res) {
  if (!ctx.isAdmin && !ctx.isSupervisor) {
    sendJson(res, 403, { error: INBOX_NO_ACCESS_RU })
    return
  }
  const view = String(req.query?.view ?? 'list')
  const db = ctx.supabaseAdmin
  const clubFilter = inboxDeliveryClubFilter(ctx)

  try {
    if (view === 'detail') {
      const id = String(req.query?.id ?? '').trim()
      if (!isInboxUuid(id)) {
        sendJson(res, 400, { error: 'Неверный id' })
        return
      }
      let q = db.from('client_ratings').select(SELECT).eq('id', id).not('answered_at', 'is', null)
      if (clubFilter) q = q.eq('club_id', clubFilter)
      const found = await rows(q.limit(1))
      const row = found[0]
      if (!row) {
        sendJson(res, 404, { error: 'Оценка не найдена' })
        return
      }
      const [names, clubs] = await Promise.all([
        loadClientNames(db, [row.client_id]),
        loadClubNames(db, row.club_id ? [row.club_id] : []),
      ])
      sendJson(res, 200, { rating: enrich(row, names, clubs) })
      return
    }

    let q = db
      .from('client_ratings')
      .select(SELECT)
      .not('answered_at', 'is', null)
      .not('score', 'is', null)
      .order('answered_at', { ascending: false })
      .limit(100)
    if (clubFilter) q = q.eq('club_id', clubFilter)
    const list = await rows(q)
    const [names, clubs] = await Promise.all([
      loadClientNames(
        db,
        list.map((r) => r.client_id),
      ),
      loadClubNames(
        db,
        list.map((r) => r.club_id),
      ),
    ])
    sendJson(res, 200, {
      items: list.map((r) => enrich(r, names, clubs)).filter(Boolean),
    })
  } catch (e) {
    if (isMissingTable(e)) {
      sendJson(res, 200, view === 'detail' ? { rating: null } : { items: [] })
      return
    }
    throw e
  }
}
