/**
 * Данные клиента для карточки (админ — любой клиент; тренер — только свои).
 * GET ?client_id=<uuid>
 */
import { requireAuthUser, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'

const PAGE = 500

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

  if (!ctx.isAdmin && !ctx.isTrainer) {
    sendJson(res, 403, { error: 'Нет доступа' })
    return
  }

  const clientId = String(req.query?.client_id ?? req.query?.clientId ?? '').trim()
  if (
    !clientId ||
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(clientId)
  ) {
    sendJson(res, 400, { error: 'Укажите client_id (UUID клиента)' })
    return
  }

  const { supabaseAdmin } = ctx

  const { data: client, error: ce } = await supabaseAdmin.from('clients').select('*').eq('id', clientId).maybeSingle()
  if (ce) {
    sendJson(res, 400, { error: ce.message })
    return
  }
  if (!client) {
    sendJson(res, 404, { error: 'Клиент не найден' })
    return
  }

  if (!ctx.isAdmin && String(client.trainer_id) !== String(ctx.user.id)) {
    sendJson(res, 403, { error: 'Этот клиент закреплён за другим тренером' })
    return
  }

  const { data: memberships, error: me } = await supabaseAdmin.from('memberships').select('*').eq('client_id', clientId)
  if (me) {
    sendJson(res, 400, { error: me.message })
    return
  }

  const { data: health_card, error: he } = await supabaseAdmin
    .from('health_cards')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (he) {
    sendJson(res, 400, { error: he.message })
    return
  }

  const body_measurements = []
  let mFrom = 0
  for (;;) {
    const { data: mRows, error: be } = await supabaseAdmin
      .from('body_measurements')
      .select('*')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(mFrom, mFrom + PAGE - 1)
    if (be) {
      sendJson(res, 400, { error: be.message })
      return
    }
    const chunk = mRows ?? []
    body_measurements.push(...chunk)
    if (chunk.length < PAGE) break
    mFrom += PAGE
  }

  const trainings = []
  let from = 0
  for (;;) {
    const { data: trains, error: te } = await supabaseAdmin
      .from('trainings')
      .select('*')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)
    if (te) {
      sendJson(res, 400, { error: te.message })
      return
    }
    const rows = trains ?? []
    trainings.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  sendJson(res, 200, {
    client,
    memberships: memberships ?? [],
    health_card: health_card ?? null,
    body_measurements,
    trainings,
  })
}

export default withSafeApiHandler(handler, { label: 'get-client' })
