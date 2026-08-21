/**
 * Абонементы всех клиентов клуба + lifecycle направлений (админ / менеджер своего клуба).
 * GET ?club_id=<uuid>
 * Ответ: { memberships, client_hall_lifecycle, … } — lifecycle опционален (старый клиент игнорит).
 */
import { requireAdminOrSalesManager, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import { LIST_MEMBERSHIPS_MAX, LIST_CLIENT_HALL_LIFECYCLE_MAX } from './_lib/apiLimits.js'

const PAGE = 500
const IN_CHUNK = 80

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

  const ctx = await requireAdminOrSalesManager(req, res, rawClub)
  if (!ctx) return

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
  let truncated = false
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue
    if (memberships.length >= LIST_MEMBERSHIPS_MAX) {
      truncated = true
      break
    }
    const { data, error } = await supabaseAdmin.from('memberships').select('*').in('client_id', chunk)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    for (const row of data ?? []) {
      if (memberships.length >= LIST_MEMBERSHIPS_MAX) {
        truncated = true
        break
      }
      memberships.push(row)
    }
    if (truncated) break
  }

  /** Жизнь по залам — тот же pull, без новой Vercel-функции. */
  let client_hall_lifecycle = []
  let lifecycleTruncated = false
  let lifecycleError = null
  try {
    let lifeFrom = 0
    for (;;) {
      if (client_hall_lifecycle.length >= LIST_CLIENT_HALL_LIFECYCLE_MAX) {
        lifecycleTruncated = true
        break
      }
      const room = LIST_CLIENT_HALL_LIFECYCLE_MAX - client_hall_lifecycle.length
      const limit = Math.min(PAGE, room)
      const { data, error } = await supabaseAdmin
        .from('client_hall_lifecycle')
        .select('*')
        .eq('club_id', rawClub)
        .order('id', { ascending: true })
        .range(lifeFrom, lifeFrom + limit - 1)
      if (error) {
        lifecycleError = error.message
        break
      }
      const chunk = data ?? []
      client_hall_lifecycle.push(...chunk)
      if (chunk.length < limit) break
      lifeFrom += limit
    }
  } catch (e) {
    lifecycleError = e?.message ? String(e.message).slice(0, 200) : 'lifecycle_fetch_failed'
  }

  sendJson(res, 200, {
    memberships,
    count: memberships.length,
    club_id: rawClub,
    truncated,
    client_hall_lifecycle,
    client_hall_lifecycle_count: client_hall_lifecycle.length,
    client_hall_lifecycle_truncated: lifecycleTruncated,
    ...(lifecycleError
      ? { client_hall_lifecycle_error: String(lifecycleError).slice(0, 200) }
      : {}),
  })
}

export default withSafeApiHandler(handler, { label: 'list-memberships' })
