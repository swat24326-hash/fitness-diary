import { sendJson } from '../adminSupabase.js'

const MAX_PAGE = 100
const DEFAULT_PAGE = 50

/**
 * GET admin-data?action=deletion-audit-log&club_id=&page=&page_size=&q=
 * Админ — любой клуб (club_id опционален); менеджер — только свой клуб.
 */
export async function handleDeletionAuditLogGet(ctx, req, res) {
  const page = Math.max(0, Number(req.query?.page) || 0)
  const size = Math.min(MAX_PAGE, Math.max(1, Number(req.query?.page_size ?? req.query?.pageSize) || DEFAULT_PAGE))
  const q = String(req.query?.q ?? '').trim().toLowerCase()
  let clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()

  if (ctx.isSalesManager && !ctx.isAdmin) {
    const smClub = String(ctx.salesClubId ?? ctx.profile?.club_id ?? '').trim()
    if (!smClub) {
      sendJson(res, 400, { error: 'В профиле нет клуба' })
      return
    }
    clubId = smClub
  }

  const { supabaseAdmin } = ctx
  let query = supabaseAdmin
    .from('deletion_audit_log')
    .select('*', { count: 'exact' })
    .eq('entity_table', 'clients')
    .order('created_at', { ascending: false })

  if (clubId) query = query.eq('club_id', clubId)

  const start = page * size
  const { data, error, count } = await query.range(start, start + size - 1)
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }

  let rows = data ?? []
  if (q) {
    rows = rows.filter((r) => {
      const blob = [r.entity_name, r.entity_card_number, r.entity_phone, r.deleted_by_name, r.trainer_name]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ')
      return blob.includes(q)
    })
  }

  sendJson(res, 200, {
    rows,
    totalCount: typeof count === 'number' ? count : rows.length,
    page,
    pageSize: size,
    club_id: clubId || null,
  })
}
