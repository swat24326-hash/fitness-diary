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
  aggregateMonthlyTypedCompleted,
  aggregateMonthlyForCalendarYear,
  discoverMonthlyChartYearsFromBounds,
  summarizeCalendarYearMonthlyEligibility,
} from '../clubMonthlyAgg.js'
import { IN_CHUNK, PAGE } from './constants.js'
import { fetchPaged, fetchCompletedTrainingYearBounds } from './paging.js'
import { aggregateCoachQuality } from '../../../src/lib/admin/coachQualityAgg.js'
import { coachQualityRulesHelp } from '../../../src/lib/admin/coachQualityCore.js'
import {
  activeClientIdsFromTrainings,
  fetchCoachQualityCareInputs,
} from '../coachQualityCareFetch.js'

export async function handleClubStats(ctx, req, res) {
  const clubId = String(req.query?.club_id ?? '').trim()
  const dateFrom = String(req.query?.date_from ?? '').trim()
  const dateTo = String(req.query?.date_to ?? '').trim()
  if (!clubId || !dateFrom || !dateTo || dateFrom > dateTo) {
    sendJson(res, 400, { error: 'Укажите club_id, date_from, date_to' })
    return
  }
  try {
    const { supabaseAdmin } = ctx
    const raw = await fetchClubStatsRaw(supabaseAdmin, { clubId, dateFrom, dateTo })
    const activeIds = activeClientIdsFromTrainings(raw.trainings, dateFrom, dateTo)
    let careInputs = {
      healthByClientId: {},
      lastMeasureByClientId: {},
      hadMeasureEverByClientId: {},
      weightEntriesByClientId: {},
    }
    try {
      careInputs = await fetchCoachQualityCareInputs(supabaseAdmin, activeIds)
    } catch (careErr) {
      console.warn('[club-stats] coachQuality care inputs', careErr)
    }
    const coachQuality = {
      ...aggregateCoachQuality({
        trainings: raw.trainings,
        clients: raw.clients,
        memberships: raw.memberships,
        membershipTypes: raw.membershipTypes,
        ...careInputs,
        dateFrom,
        dateTo,
      }),
      rules: coachQualityRulesHelp(),
      source: 'admin_api',
    }
    sendJson(res, 200, {
      ...aggregateTrainings(raw.trainings),
      ...aggregateClubClientPeriod(raw.clients, raw.memberships, dateFrom, dateTo),
      ...aggregateMembershipTypeStats({
        trainings: raw.trainings,
        memberships: raw.memberships,
        membershipTypes: raw.membershipTypes,
      }),
      coachQuality,
      source: 'admin_api',
      stats_truncated: raw.truncated,
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
