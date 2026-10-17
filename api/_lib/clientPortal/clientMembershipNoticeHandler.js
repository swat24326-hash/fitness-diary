/**
 * POST /api/client-me { action: 'membership-notice-read', id } — отметить прочитанным.
 * GET сводка — loadClientMembershipNoticesSummary.
 */
import { sendJson } from '../adminSupabase.js'
import { publicMembershipNotice } from '../../../src/lib/client/clientMembershipNoticeCore.js'

async function rows(query) {
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

function isMissingTable(e) {
  return /client_membership_notices|does not exist|42P01/i.test(String(e?.message ?? e?.code ?? ''))
}

const SELECT = 'id, client_id, club_id, kind, membership_end_date, days_left, title, body, created_at, read_at, notified_at'

/** Открытые + прочитанные за 30 дней — для ленты. */
export async function loadClientMembershipNoticesSummary(db, clientId) {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const list = await rows(
      db
        .from('client_membership_notices')
        .select(SELECT)
        .eq('client_id', clientId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20),
    )
    return list.map(publicMembershipNotice).filter(Boolean)
  } catch (e) {
    if (isMissingTable(e)) return []
    throw e
  }
}

export async function handleClientMembershipNoticePost(db, ctx, body, res) {
  const action = String(body?.action ?? '')
  if (action !== 'membership-notice-read') {
    sendJson(res, 400, { error: 'Неизвестное действие' })
    return
  }
  const id = String(body?.id ?? '').trim()
  if (!id) {
    sendJson(res, 400, { error: 'Нет id уведомления' })
    return
  }
  let row
  try {
    const found = await rows(
      db.from('client_membership_notices').select(SELECT).eq('id', id).eq('client_id', ctx.clientId).limit(1),
    )
    row = found[0]
  } catch (e) {
    if (isMissingTable(e)) {
      sendJson(res, 503, { error: 'Уведомления об абонементе ещё не подключены' })
      return
    }
    throw e
  }
  if (!row) {
    sendJson(res, 404, { error: 'Уведомление не найдено' })
    return
  }
  if (row.read_at) {
    sendJson(res, 200, { notice: publicMembershipNotice(row) })
    return
  }
  const updated = await rows(
    db
      .from('client_membership_notices')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('client_id', ctx.clientId)
      .is('read_at', null)
      .select(SELECT),
  )
  sendJson(res, 200, { notice: publicMembershipNotice(updated[0] ?? { ...row, read_at: new Date().toISOString() }) })
}
