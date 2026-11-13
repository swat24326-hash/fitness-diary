/**
 * Абонементы всех клиентов клуба + lifecycle направлений (админ / менеджер своего клуба).
 * GET ?club_id=<uuid>[&updated_since=ISO]
 * Ответ: { memberships, client_ids, membership_ids, server_time, client_hall_lifecycle, … }
 */
import { publicDbErrorMessage } from './_lib/dbErrorPublicCore.js'
import { requireAdminOrSalesManager, sendJson, setCors } from './_lib/adminSupabase.js'
import { withSafeApiHandler } from './_lib/safeApiHandler.js'
import {
  LIST_MEMBERSHIPS_MAX,
  LIST_CLIENT_HALL_LIFECYCLE_MAX,
  LIST_CLIENT_AZ_INSTRUCTORS_MAX,
} from './_lib/apiLimits.js'
import {
  LIST_MEMBERSHIPS_SELECT,
  parseUpdatedSinceQuery,
} from './_lib/adminClientsListSelectCore.js'

const PAGE = 500

async function loadIdsPaged(supabaseAdmin, table, clubId, selectCols = 'id') {
  const ids = []
  let from = 0
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(selectCols)
      .eq('club_id', clubId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
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

  const clientIdLoad = await loadIdsPaged(supabaseAdmin, 'clients', rawClub)
  if (clientIdLoad.error) {
    sendJson(res, 400, { error: publicDbErrorMessage(clientIdLoad.error, 'list-memberships') })
    return
  }
  const client_ids = clientIdLoad.ids

  const membershipIdLoad = await loadIdsPaged(supabaseAdmin, 'memberships', rawClub)
  if (membershipIdLoad.error) {
    sendJson(res, 400, { error: publicDbErrorMessage(membershipIdLoad.error, 'list-memberships') })
    return
  }
  const membership_ids = membershipIdLoad.ids

  const memberships = []
  let truncated = false
  let from = 0
  for (;;) {
    if (memberships.length >= LIST_MEMBERSHIPS_MAX) {
      truncated = true
      break
    }
    let q = supabaseAdmin
      .from('memberships')
      .select(LIST_MEMBERSHIPS_SELECT)
      .eq('club_id', rawClub)
    if (updatedSince) q = q.gt('updated_at', updatedSince)
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) {
      sendJson(res, 400, { error: publicDbErrorMessage(error, 'list-memberships') })
      return
    }
    const rows = data ?? []
    const room = LIST_MEMBERSHIPS_MAX - memberships.length
    if (rows.length > room) {
      memberships.push(...rows.slice(0, room))
      truncated = true
      break
    }
    memberships.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
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

  /** Инструкторы АЗ — тот же pull, без новой Vercel-функции. */
  let client_az_instructors = []
  let azInstructorsTruncated = false
  let azInstructorsError = null
  try {
    let azFrom = 0
    for (;;) {
      if (client_az_instructors.length >= LIST_CLIENT_AZ_INSTRUCTORS_MAX) {
        azInstructorsTruncated = true
        break
      }
      const room = LIST_CLIENT_AZ_INSTRUCTORS_MAX - client_az_instructors.length
      const limit = Math.min(PAGE, room)
      const { data, error } = await supabaseAdmin
        .from('client_az_instructors')
        .select('*')
        .eq('club_id', rawClub)
        .order('id', { ascending: true })
        .range(azFrom, azFrom + limit - 1)
      if (error) {
        azInstructorsError = error.message
        break
      }
      const chunk = data ?? []
      client_az_instructors.push(...chunk)
      if (chunk.length < limit) break
      azFrom += limit
    }
  } catch (e) {
    azInstructorsError = e?.message ? String(e.message).slice(0, 200) : 'az_instructors_fetch_failed'
  }

  sendJson(res, 200, {
    memberships,
    count: memberships.length,
    club_id: rawClub,
    truncated,
    server_time,
    client_ids,
    membership_ids,
    ...(updatedSince ? { updated_since: updatedSince } : {}),
    client_hall_lifecycle,
    client_hall_lifecycle_count: client_hall_lifecycle.length,
    client_hall_lifecycle_truncated: lifecycleTruncated,
    ...(lifecycleError
      ? { client_hall_lifecycle_error: String(lifecycleError).slice(0, 200) }
      : {}),
    client_az_instructors,
    client_az_instructors_count: client_az_instructors.length,
    client_az_instructors_truncated: azInstructorsTruncated,
    ...(azInstructorsError
      ? { client_az_instructors_error: String(azInstructorsError).slice(0, 200) }
      : {}),
  })
}

export default withSafeApiHandler(handler, { label: 'list-memberships' })
