import { sendJson } from '../adminSupabase.js'
import { CLIENT_BRIEF, IN_CHUNK, MAX_JOURNAL_PAGE, TRAINER_ROLES, escapeForIlike } from './constants.js'

export async function handleSearch(ctx, req, res) {
  const raw = String(req.query?.q ?? req.query?.query ?? '').trim()
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50))
  if (raw.length < 2) {
    sendJson(res, 200, { clients: [] })
    return
  }
  const pattern = `%${escapeForIlike(raw)}%`
  const part = Math.min(limit, Math.max(20, Math.ceil(limit / 3)))
  const { supabaseAdmin } = ctx
  let qName = supabaseAdmin.from('clients').select(CLIENT_BRIEF).ilike('name', pattern).limit(part)
  let qPhone = supabaseAdmin.from('clients').select(CLIENT_BRIEF).ilike('phone', pattern).limit(part)
  if (clubId) {
    qName = qName.eq('club_id', clubId)
    qPhone = qPhone.eq('club_id', clubId)
  }
  const [{ data: byName, error: e1 }, { data: byPhone, error: e2 }] = await Promise.all([qName, qPhone])
  if (e1) {
    sendJson(res, 400, { error: e1.message })
    return
  }
  if (e2) {
    sendJson(res, 400, { error: e2.message })
    return
  }
  const { data: trainerHits } = await supabaseAdmin
    .from('users')
    .select('id')
    .in('role', TRAINER_ROLES)
    .ilike('name', pattern)
    .limit(part)
  const tidList = [...new Set((trainerHits ?? []).map((t) => t.id).filter(Boolean))]
  let byTrainer = []
  if (tidList.length) {
    let qc = supabaseAdmin.from('clients').select(CLIENT_BRIEF).in('trainer_id', tidList).limit(part)
    if (clubId) qc = qc.eq('club_id', clubId)
    const { data, error: e4 } = await qc
    if (e4) {
      sendJson(res, 400, { error: e4.message })
      return
    }
    byTrainer = data ?? []
  }
  const map = new Map()
  for (const c of [...(byName ?? []), ...(byPhone ?? []), ...byTrainer]) {
    if (c?.id && !map.has(c.id)) map.set(c.id, c)
  }
  sendJson(res, 200, { clients: [...map.values()].slice(0, limit) })
}

export async function handleJournal(ctx, req, res) {
  const page = Math.max(0, Number(req.query?.page) || 0)
  const size = Math.min(MAX_JOURNAL_PAGE, Math.max(1, Number(req.query?.page_size ?? req.query?.pageSize) || 50))
  const { supabaseAdmin } = ctx
  let q = supabaseAdmin.from('trainings').select('*', { count: 'exact' })
  const clubId = String(req.query?.club_id ?? '').trim()
  const trainerId = String(req.query?.trainer_id ?? '').trim()
  const clientId = String(req.query?.client_id ?? '').trim()
  const status = String(req.query?.status ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? '').trim()
  const dateTo = String(req.query?.date_to ?? '').trim()
  if (clubId) q = q.eq('club_id', clubId)
  if (trainerId) q = q.eq('trainer_id', trainerId)
  if (clientId) q = q.eq('client_id', clientId)
  if (status) q = q.eq('status', status)
  if (dateFrom) q = q.gte('date', dateFrom)
  if (dateTo) q = q.lte('date', dateTo)
  const start = page * size
  const { data, error, count } = await q
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + size - 1)
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  const rows = data ?? []
  const clientIds = [...new Set(rows.map((t) => t.client_id).filter(Boolean))]
  const clientsById = {}
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    const { data: clients, error: ce } = await supabaseAdmin.from('clients').select(CLIENT_BRIEF).in('id', chunk)
    if (ce) {
      sendJson(res, 400, { error: ce.message })
      return
    }
    for (const c of clients ?? []) clientsById[c.id] = c
  }
  sendJson(res, 200, { trainings: rows, clientsById, totalCount: count ?? rows.length, page, pageSize: size })
}

/**
 * Последняя дата тренировки по клиентам страницы списка (облако).
 * GET ?club_id=&client_ids=id1,id2 (≤50)
 */
export async function handleClientsLastTrainings(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  const ids = [
    ...new Set(
      String(req.query?.client_ids ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 50)

  if (!clubId || !ids.length) {
    sendJson(res, 200, { lastByClient: {} })
    return
  }

  const { supabaseAdmin } = ctx

  /** Одна выборка на страницу списка (не N запросов на клиента). */
  async function maxDateByClient(clientIds, statusEq) {
    const want = (clientIds ?? []).map((id) => String(id).trim()).filter(Boolean)
    if (!want.length) return {}
    let q = supabaseAdmin
      .from('trainings')
      .select('client_id, date')
      .eq('club_id', clubId)
      .in('client_id', want)
      .order('date', { ascending: false })
      .limit(8000)
    if (statusEq) q = q.eq('status', statusEq)
    const { data, error } = await q
    if (error) throw error
    /** @type {Record<string, string>} */
    const out = {}
    for (const row of data ?? []) {
      const id = String(row?.client_id ?? '').trim()
      const d = String(row?.date ?? '').slice(0, 10)
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      if (!out[id] || d > out[id]) out[id] = d
    }
    return out
  }

  try {
    const lastByClient = await maxDateByClient(ids, 'completed')
    const missing = ids.filter((id) => !lastByClient[id])
    if (missing.length) {
      const anyMap = await maxDateByClient(missing, null)
      for (const id of missing) {
        if (anyMap[id]) lastByClient[id] = anyMap[id]
      }
    }
    sendJson(res, 200, { lastByClient })
  } catch (e) {
    sendJson(res, 500, { error: e?.message ? String(e.message).slice(0, 200) : 'Ошибка' })
  }
}
