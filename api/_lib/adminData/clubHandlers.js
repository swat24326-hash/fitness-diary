import { sendJson } from '../adminSupabase.js'
import { fetchClubStatsRaw } from '../clubStatsFetch.js'
import {
  HEALTH_CARDS_BODY_MEASUREMENTS_MONTHS,
  HEALTH_CARDS_MAX,
  HEALTH_CARDS_MAX_BODY_MEASUREMENTS,
} from '../apiLimits.js'
import { aggregateTrainings, aggregateClubClientPeriod } from '../clubStatsAgg.js'
import { aggregateMembershipTypeStats } from '../membershipTypeStatsAgg.js'
import {
  aggregateHallMembershipTypeCensus,
  filterTrainingsByClubStatsHall,
  normalizeClubStatsHall,
  sliceClubStatsByHall,
} from '../clubStatsHallFilterCore.js'
import {
  aggregateMonthlyTypedCompleted,
  aggregateMonthlyForCalendarYear,
  discoverMonthlyChartYearsFromBounds,
  summarizeCalendarYearMonthlyEligibility,
} from '../clubMonthlyAgg.js'
import { IN_CHUNK, PAGE } from './constants.js'
import { fetchPaged, fetchCompletedTrainingYearBounds } from './paging.js'
import {
  buildClubCoachQualityPayload,
  parseIncludeCqFlag,
} from '../clubCoachQualityCore.js'
import { fetchClubTrainerModeIds } from '../clubTrainerModeIds.js'

export async function handleClubStats(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? '').trim()
  const dateTo = String(req.query?.date_to ?? '').trim()
  const hallParam = String(req.query?.hall ?? '').trim()
  const hall = normalizeClubStatsHall(hallParam) || (hallParam ? 'pz' : null)
  // UI всегда шлёт hall; без параметра — legacy commercial (совместимость day-summary / старых клиентов).
  const includeCq = parseIncludeCqFlag(req.query?.include_cq)
  if (!clubId || !dateFrom || !dateTo || dateFrom > dateTo) {
    sendJson(res, 400, { error: 'Укажите club_id, date_from, date_to' })
    return
  }
  try {
    const { supabaseAdmin } = ctx
    const [raw, modeIds] = await Promise.all([
      fetchClubStatsRaw(supabaseAdmin, { clubId, dateFrom, dateTo }),
      fetchClubTrainerModeIds(supabaseAdmin, clubId),
    ])
    const periodOpts = {
      holdingTrainerIds: modeIds.holdingTrainerIds,
      noTabletTrainerIds: modeIds.noTabletTrainerIds,
      ...(hall ? { hall } : {}),
    }
    const hallTrainings = hall
      ? filterTrainingsByClubStatsHall(raw.trainings, raw.memberships, raw.clients, hall)
      : raw.trainings
    // ТЗ/АЗ: «По типам» = census абонов зала (не тренировки планшета ПЗ).
    const typeStats =
      hall === 'tz' || hall === 'az'
        ? aggregateHallMembershipTypeCensus({
            memberships: sliceClubStatsByHall(raw.clients, raw.memberships, hall, periodOpts)
              .memberships,
            membershipTypes: raw.membershipTypes,
          })
        : aggregateMembershipTypeStats({
            trainings: hallTrainings,
            memberships: raw.memberships,
            membershipTypes: raw.membershipTypes,
          })
    const base = {
      ...aggregateTrainings(hallTrainings),
      ...aggregateClubClientPeriod(raw.clients, raw.memberships, dateFrom, dateTo, undefined, periodOpts),
      ...typeStats,
      hall: hall || null,
      source: 'admin_api',
      stats_timestamp: raw.timestamp,
    }

    if (!includeCq || (hall && hall !== 'pz')) {
      sendJson(res, 200, { ...base, coachQuality: null })
      return
    }

    const { coachQuality } = await buildClubCoachQualityPayload(supabaseAdmin, {
      clubId,
      dateFrom,
      dateTo,
      mode: 'full',
      raw,
      ...periodOpts,
    })
    sendJson(res, 200, { ...base, coachQuality })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка' })
  }
}

/**
 * GET admin-data?action=coach-quality
 * admin: клуб; trainer: только свой club_id + свой trainer_id.
 */
export async function handleCoachQuality(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? '').trim()
  const dateTo = String(req.query?.date_to ?? '').trim()
  const mode = String(req.query?.mode ?? 'full').trim().toLowerCase() === 'glance' ? 'glance' : 'full'
  if (!clubId || !dateFrom || !dateTo || dateFrom > dateTo) {
    sendJson(res, 400, { error: 'Укажите club_id, date_from, date_to' })
    return
  }

  let trainerIdFilter = String(req.query?.trainer_id ?? '').trim() || null
  if (ctx.isTrainer && !ctx.isAdmin) {
    const selfId = String(ctx.user?.id ?? '').trim()
    const userClub = String(ctx.profile?.club_id ?? '').trim()
    if (!selfId || !userClub || userClub !== clubId) {
      sendJson(res, 403, { error: 'Нет доступа к качеству этого клуба' })
      return
    }
    trainerIdFilter = selfId
  }

  try {
    const payload = await buildClubCoachQualityPayload(ctx.supabaseAdmin, {
      clubId,
      dateFrom,
      dateTo,
      trainerIdFilter,
      mode,
    })
    sendJson(res, 200, {
      ...payload,
      source: 'admin_api',
    })
  } catch (e) {
    sendJson(res, 400, { error: e?.message ? String(e.message) : 'Ошибка' })
  }
}

export async function handleHealthCards(ctx, req, res) {
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
  let healthTruncated = false
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue
    if (health_cards.length >= HEALTH_CARDS_MAX) {
      healthTruncated = true
      break
    }
    const { data, error } = await supabaseAdmin.from('health_cards').select('*').in('client_id', chunk)
    if (error) {
      sendJson(res, 400, { error: error.message })
      return
    }
    for (const row of data ?? []) {
      if (health_cards.length >= HEALTH_CARDS_MAX) {
        healthTruncated = true
        break
      }
      health_cards.push(row)
    }
    if (healthTruncated) break
  }
  const body_measurements = []
  let bodyTruncated = false
  const measurementsSince = new Date()
  measurementsSince.setMonth(measurementsSince.getMonth() - HEALTH_CARDS_BODY_MEASUREMENTS_MONTHS)
  const measurementsSinceIso = measurementsSince.toISOString().slice(0, 10)
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) {
    const chunk = clientIds.slice(i, i + IN_CHUNK)
    if (!chunk.length) continue
    if (body_measurements.length >= HEALTH_CARDS_MAX_BODY_MEASUREMENTS) {
      bodyTruncated = true
      break
    }
    const { data: bm, error: bme } = await supabaseAdmin
      .from('body_measurements')
      .select('*')
      .in('client_id', chunk)
      .gte('date', measurementsSinceIso)
      .order('date', { ascending: false })
    if (bme) {
      sendJson(res, 400, { error: bme.message })
      return
    }
    for (const row of bm ?? []) {
      if (body_measurements.length >= HEALTH_CARDS_MAX_BODY_MEASUREMENTS) {
        bodyTruncated = true
        break
      }
      body_measurements.push(row)
    }
    if (bodyTruncated) break
  }
  sendJson(res, 200, {
    health_cards,
    body_measurements,
    count: health_cards.length,
    body_measurements_count: body_measurements.length,
    club_id: rawClub,
    truncated: healthTruncated || bodyTruncated,
    measurements_since: measurementsSinceIso,
  })
}

export async function handleClubMonthly(ctx, req, res) {
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
      const [trainings, memberships, yearBounds] = await Promise.all([
        fetchPaged(supabaseAdmin, 'trainings', 'id, date, status, data', clubId, yearStart, yearEnd),
        fetchPaged(supabaseAdmin, 'memberships', 'id, membership_type_id', clubId, null, null),
        fetchCompletedTrainingYearBounds(supabaseAdmin, clubId),
      ])
      sendJson(res, 200, {
        months: aggregateMonthlyForCalendarYear({
          trainings,
          memberships,
          year: y,
        }),
        years: discoverMonthlyChartYearsFromBounds({ ...yearBounds, anchorYear: y }),
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
