/**
 * Объединённый GET API админки/тренера (лимит Vercel Hobby: 12 functions).
 * ?action=search|journal|club-stats|health-cards|challenges|challenge-trainings|exercises|clubs
 */
import { requireAdmin, requireAuthUser, sendJson, setCors } from './lib/adminSupabase.js'
import { aggregateTrainings, aggregateClubClientPeriod } from './lib/clubStatsAgg.js'
import { aggregateMembershipTypeStats } from './lib/membershipTypeStatsAgg.js'
import {
  aggregateMonthlyTypedCompleted,
  aggregateMonthlyForCalendarYear,
  discoverMonthlyChartYears,
  summarizeCalendarYearMonthlyEligibility,
} from './lib/clubMonthlyAgg.js'

const PAGE = 400
const IN_CHUNK = 80
const CLIENT_BRIEF = 'id, name, phone, email, trainer_id, club_id, card_number'
const TRAINER_ROLES = ['trainer', 'тренер']
const MAX_JOURNAL_PAGE = 100

function escapeForIlike(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

async function handleSearch(ctx, req, res) {
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

async function handleJournal(ctx, req, res) {
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

async function fetchPaged(supabaseAdmin, table, select, clubId, dateFrom, dateTo) {
  const rows = []
  let from = 0
  for (;;) {
    let q = supabaseAdmin.from(table).select(select).eq('club_id', clubId)
    if (table === 'trainings' && dateFrom && dateTo) {
      q = q.gte('date', dateFrom).lte('date', dateTo)
    }
    const { data, error } = await q.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw error
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function handleClubStats(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? '').trim()
  const dateTo = String(req.query?.date_to ?? '').trim()
  if (!clubId || !dateFrom || !dateTo || dateFrom > dateTo) {
    sendJson(res, 400, { error: 'Укажите club_id, date_from, date_to' })
    return
  }
  try {
    const { supabaseAdmin } = ctx
    const [trainings, clients, memberships, membershipTypes] = await Promise.all([
      fetchPaged(supabaseAdmin, 'trainings', 'id, trainer_id, client_id, date, status, data', clubId, dateFrom, dateTo),
      fetchPaged(supabaseAdmin, 'clients', 'id, name, phone', clubId, null, null),
      fetchPaged(
        supabaseAdmin,
        'memberships',
        'id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id',
        clubId,
        null,
        null,
      ),
      fetchPaged(supabaseAdmin, 'membership_types', 'id, code, sort_order, is_active', clubId, null, null),
    ])
    sendJson(res, 200, {
      ...aggregateTrainings(trainings),
      ...aggregateClubClientPeriod(clients, memberships, dateFrom, dateTo),
      ...aggregateMembershipTypeStats({ trainings, memberships, membershipTypes }),
      source: 'admin_api',
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка' })
  }
}

async function handleHealthCards(ctx, req, res) {
  const rawClub = String(req.query?.club_id ?? '').trim()
  if (!rawClub) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  const { supabaseAdmin } = ctx
  const clientIds = []
  let from = 0
  for (;;) {
    const { data, error } = await supabaseAdmin.from('clients').select('id').eq('club_id', rawClub).range(from, from + PAGE - 1)
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
  const health_cards = []
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue
    const { data, error } = await supabaseAdmin.from('health_cards').select('*').in('client_id', chunk)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    health_cards.push(...(data ?? []))
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
  sendJson(res, 200, {
    health_cards,
    body_measurements,
    count: health_cards.length,
    body_measurements_count: body_measurements.length,
    club_id: rawClub,
  })
}

async function handleChallenges(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (authCtx.isTrainer && !authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Челленджи другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Челленджи другого клуба недоступны' })
        return
      }
    }
  }
  const { data, error } = await authCtx.supabaseAdmin
    .from('challenges')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { challenges: data ?? [], count: (data ?? []).length, club_id: clubId })
}

/** Завершённые и черновики тренировок клуба за период — для рейтинга челленджа. */
async function handleChallengeTrainings(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? req.query?.dateFrom ?? '').trim()
  const dateTo = String(req.query?.date_to ?? req.query?.dateTo ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }
  if (!dateFrom || !dateTo) {
    sendJson(res, 400, { error: 'Укажите date_from и date_to (YYYY-MM-DD)' })
    return
  }

  if (authCtx.isTrainer && !authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Тренировки другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Нет доступа к тренировкам этого клуба' })
        return
      }
    }
  }

  const trainings = await fetchPaged(authCtx.supabaseAdmin, 'trainings', '*', clubId, dateFrom, dateTo)
  sendJson(res, 200, { trainings, count: trainings.length, club_id: clubId, date_from: dateFrom, date_to: dateTo })
}

async function handleClubs(ctx, res) {
  const { data, error } = await ctx.supabaseAdmin.from('clubs').select('*').order('id', { ascending: true })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  sendJson(res, 200, { clubs: data ?? [], count: (data ?? []).length })
}

async function handleMembershipTypes(authCtx, req, res) {
  const clubId = String(req.query?.club_id ?? req.query?.clubId ?? '').trim()
  if (!clubId) {
    sendJson(res, 400, { error: 'Укажите club_id' })
    return
  }

  if (!authCtx.isAdmin) {
    const { data: prof } = await authCtx.supabaseAdmin
      .from('users')
      .select('club_id')
      .eq('id', authCtx.user.id)
      .maybeSingle()
    const trainerClub = String(prof?.club_id ?? '').trim()
    if (trainerClub && trainerClub !== clubId) {
      sendJson(res, 403, { error: 'Типы другого клуба недоступны' })
      return
    }
    if (!trainerClub) {
      const { data: sample } = await authCtx.supabaseAdmin
        .from('clients')
        .select('id')
        .eq('trainer_id', authCtx.user.id)
        .eq('club_id', clubId)
        .limit(1)
      if (!(sample ?? []).length) {
        sendJson(res, 403, { error: 'Нет доступа к типам этого клуба' })
        return
      }
    }
  }

  const { data, error } = await authCtx.supabaseAdmin
    .from('membership_types')
    .select('*')
    .eq('club_id', clubId)
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })
  if (error) {
    sendJson(res, 400, { error: error.message })
    return
  }
  const rows = data ?? []
  sendJson(res, 200, { membership_types: rows, count: rows.length, club_id: clubId })
}

async function handleExercisesMeta(authCtx, res) {
  const { count, error: countErr } = await authCtx.supabaseAdmin
    .from('exercises')
    .select('*', { count: 'exact', head: true })
  if (countErr) {
    sendJson(res, 400, { error: countErr.message })
    return
  }
  const { data: latest, error: latestErr } = await authCtx.supabaseAdmin
    .from('exercises')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  if (latestErr) {
    sendJson(res, 400, { error: latestErr.message })
    return
  }
  const max_created_at = latest?.[0]?.created_at ?? null
  sendJson(res, 200, { count: count ?? 0, max_created_at })
}

async function handleExercises(authCtx, res) {
  const all = []
  let from = 0
  let maxCreatedAt = null
  for (;;) {
    const { data, error } = await authCtx.supabaseAdmin
      .from('exercises')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    const chunk = data ?? []
    for (const row of chunk) {
      const t = String(row.created_at ?? '')
      if (t && (!maxCreatedAt || t > maxCreatedAt)) maxCreatedAt = t
    }
    all.push(...chunk)
    if (chunk.length < PAGE) break
    from += PAGE
  }
  sendJson(res, 200, { exercises: all, count: all.length, max_created_at: maxCreatedAt })
}

async function handleClubMonthly(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const yearOnly = String(req.query?.year ?? '').trim()

  if (yearOnly) {
    const y = Number(yearOnly)
    if (!clubId || !Number.isFinite(y) || y < 2000) {
      sendJson(res, 400, { error: 'Укажите club_id и year' })
      return
    }
    try {
      const { supabaseAdmin } = ctx
      const yearStart = `${y}-01-01`
      const yearEnd = `${y}-12-31`
      const [trainings, memberships, allTrainings] = await Promise.all([
        fetchPaged(supabaseAdmin, 'trainings', 'id, date, status, data', clubId, yearStart, yearEnd),
        fetchPaged(supabaseAdmin, 'memberships', 'id, membership_type_id', clubId, null, null),
        fetchPaged(supabaseAdmin, 'trainings', 'id, date, status', clubId, null, null),
      ])
      sendJson(res, 200, {
        months: aggregateMonthlyForCalendarYear({
          trainings,
          memberships,
          year: y,
        }),
        years: discoverMonthlyChartYears(allTrainings, { anchorYear: y }),
        yearSummary: summarizeCalendarYearMonthlyEligibility({
          trainings,
          memberships,
          year: y,
        }),
        club_id: clubId,
        year: y,
      })
    } catch (e) {
      sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка' })
    }
    return
  }

  const anchorTo = String(req.query?.anchor_to ?? '').slice(0, 10)
  const months = Math.max(3, Math.min(36, Number(req.query?.months ?? 12) || 12))
  if (!clubId || !anchorTo) {
    sendJson(res, 400, { error: 'Укажите club_id, anchor_to или year' })
    return
  }
  try {
    const { supabaseAdmin } = ctx
    const y = Number(anchorTo.slice(0, 4))
    const m1 = Number(anchorTo.slice(5, 7))
    const start = new Date(y, m1 - 1 - (months - 1), 1)
    const end = new Date(y, m1, 0) // последний день месяца anchorTo
    const dateFrom = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
    const dateTo = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`

    const [trainings, memberships] = await Promise.all([
      fetchPaged(supabaseAdmin, 'trainings', 'id, date, status, data', clubId, dateFrom, dateTo),
      fetchPaged(supabaseAdmin, 'memberships', 'id, membership_type_id', clubId, null, null),
    ])

    const rows = aggregateMonthlyTypedCompleted({ trainings, memberships, anchorTo, months })
    sendJson(res, 200, { months: rows, club_id: clubId, anchor_to: anchorTo })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка' })
  }
}

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

  const action = String(req.query?.action ?? '').trim().toLowerCase()
  const trainerActions = new Set([
    'challenges',
    'challenge-trainings',
    'exercises',
    'exercises-meta',
    'membership-types',
  ])

  if (trainerActions.has(action)) {
    const authCtx = await requireAuthUser(req, res)
    if (!authCtx) return
    if (!authCtx.isAdmin && !authCtx.isTrainer) {
      sendJson(res, 403, { error: 'Нет доступа' })
      return
    }
    if (action === 'challenges') return handleChallenges(authCtx, req, res)
    if (action === 'challenge-trainings') return handleChallengeTrainings(authCtx, req, res)
    if (action === 'exercises-meta') return handleExercisesMeta(authCtx, res)
    if (action === 'exercises') return handleExercises(authCtx, res)
    if (action === 'membership-types') return handleMembershipTypes(authCtx, req, res)
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  switch (action) {
    case 'search':
      return handleSearch(ctx, req, res)
    case 'journal':
      return handleJournal(ctx, req, res)
    case 'club-stats':
      return handleClubStats(ctx, req, res)
    case 'club-monthly':
      return handleClubMonthly(ctx, req, res)
    case 'health-cards':
      return handleHealthCards(ctx, req, res)
    case 'clubs':
      return handleClubs(ctx, res)
    default:
      sendJson(res, 400, {
        error: 'Укажите action: search, journal, club-stats, club-monthly, health-cards, challenges, challenge-trainings, exercises, membership-types, clubs',
      })
  }
}
