/**
 * Снимок данных тренера: клиенты, абонементы, карты здоровья, тренировки за 90 дней (service role).
 * GET — только для role=trainer
 */
import { requireAuthUser, sendJson, setCors } from './lib/adminSupabase.js'

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

  const ctx = await requireAuthUser(req, res)
  if (!ctx) return

  if (ctx.isAdmin) {
    sendJson(res, 403, { error: 'Только для тренера' })
    return
  }
  if (!ctx.isTrainer) {
    sendJson(res, 403, { error: 'Только для тренера' })
    return
  }

  const trainerId = ctx.user.id
  const { supabaseAdmin } = ctx
  const includeArchived = String(req.query?.include_archived ?? req.query?.includeArchived ?? '').trim() === '1'
  const archivedOnly = String(req.query?.archived ?? '').trim() === '1'
  const skipTrainings = String(req.query?.skip_trainings ?? '').trim() === '1'

  const clients = []
  let from = 0
  for (;;) {
    let q = supabaseAdmin.from('clients').select('*').eq('trainer_id', trainerId)
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
    clients.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }

  const clientIds = clients.map((c) => c.id).filter(Boolean)
  const memberships = []
  const health_cards = []

  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue

    const { data: mem, error: me } = await supabaseAdmin.from('memberships').select('*').in('client_id', chunk)
    if (me) {
      sendJson(res, 400, { error: me.message })
      return
    }
    memberships.push(...(mem ?? []))

    const { data: hc, error: he } = await supabaseAdmin.from('health_cards').select('*').in('client_id', chunk)
    if (he) {
      sendJson(res, 400, { error: he.message })
      return
    }
    health_cards.push(...(hc ?? []))
  }

  const body_measurements = []
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue

    const { data: bm, error: bme } = await supabaseAdmin
      .from('body_measurements')
      .select('*')
      .in('client_id', chunk)
      .order('date', { ascending: false })
    if (bme) {
      sendJson(res, 400, { error: bme.message })
      return
    }
    body_measurements.push(...(bm ?? []))
  }

  const trainings = []
  if (!skipTrainings) {
    const dateFrom = new Date()
    dateFrom.setDate(dateFrom.getDate() - 90)
    const dateFromIso = dateFrom.toISOString().slice(0, 10)

    for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
      const chunk = clientIds.slice(i, i + IN_CHUNK)
      if (!chunk.length) continue

      const { data: tr, error: te } = await supabaseAdmin
        .from('trainings')
        .select('*')
        .in('client_id', chunk)
        .gte('date', dateFromIso)
        .order('date', { ascending: false })
      if (te) {
        sendJson(res, 400, { error: te.message })
        return
      }
      trainings.push(...(tr ?? []))
    }
  }

  sendJson(res, 200, {
    clients,
    memberships,
    health_cards,
    body_measurements,
    trainings,
    count: {
      clients: clients.length,
      memberships: memberships.length,
      health_cards: health_cards.length,
      body_measurements: body_measurements.length,
      trainings: trainings.length,
    },
  })
}
