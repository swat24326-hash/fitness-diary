/**
 * Сборка coachQuality для club-stats / action=coach-quality (одна формула).
 */
import { aggregateCoachQuality } from '../../src/lib/admin/coachQualityAgg.js'
import { coachQualityRulesHelp } from '../../src/lib/admin/coachQualityCore.js'
import {
  buildCoachQualityMorningBrief,
  previousEqualPeriod,
} from '../../src/lib/admin/coachQualityBriefCore.js'
import {
  activeClientIdsFromTrainings,
  fetchCoachQualityCareInputs,
} from './coachQualityCareFetch.js'
import { loadClubCoachQualitySettings } from './coachQualitySettingsHandler.js'
import { fetchClubTrainerModeIds } from './clubTrainerModeIds.js'
import { fetchPagedLimited } from './fetchPagedLimited.js'
import { fetchClubStatsRaw } from './clubStatsFetch.js'
import { CLUB_STATS_MAX_TRAININGS } from './apiLimits.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{
 *   clubId: string,
 *   dateFrom: string,
 *   dateTo: string,
 *   trainerIdFilter?: string | null,
 *   mode?: 'full' | 'glance',
 *   raw?: object | null,
 *   holdingTrainerIds?: Set<string>|string[]|null,
 *   noTabletTrainerIds?: Set<string>|string[]|null,
 * }} opts
 */
export async function buildClubCoachQualityPayload(supabaseAdmin, opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const dateFrom = String(opts.dateFrom ?? '').slice(0, 10)
  const dateTo = String(opts.dateTo ?? '').slice(0, 10)
  const trainerIdFilter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : null
  const mode = opts.mode === 'glance' ? 'glance' : 'full'
  const skipBrief = mode === 'glance'

  const raw =
    opts.raw ??
    (await fetchClubStatsRaw(supabaseAdmin, { clubId, dateFrom, dateTo }))

  let holdingTrainerIds = opts.holdingTrainerIds
  let noTabletTrainerIds = opts.noTabletTrainerIds
  if (!holdingTrainerIds || !noTabletTrainerIds) {
    const modeIds = await fetchClubTrainerModeIds(supabaseAdmin, clubId)
    holdingTrainerIds = holdingTrainerIds ?? modeIds.holdingTrainerIds
    noTabletTrainerIds = noTabletTrainerIds ?? modeIds.noTabletTrainerIds
  }

  let trainings = raw.trainings ?? []
  if (trainerIdFilter) {
    trainings = trainings.filter((t) => String(t?.trainer_id ?? '') === trainerIdFilter)
  }

  const activeIds = activeClientIdsFromTrainings(trainings, dateFrom, dateTo)
  let careInputs = {
    healthByClientId: {},
    lastMeasureByClientId: {},
    hadMeasureEverByClientId: {},
    weightEntriesByClientId: {},
  }
  try {
    careInputs = await fetchCoachQualityCareInputs(supabaseAdmin, activeIds)
  } catch (careErr) {
    console.warn('[coach-quality] care inputs', careErr)
  }

  let cqConfig = null
  try {
    const settings = await loadClubCoachQualitySettings(supabaseAdmin, clubId)
    cqConfig = settings.config
  } catch (cfgErr) {
    console.warn('[coach-quality] config', cfgErr)
  }

  const clients = trainerIdFilter
    ? (raw.clients ?? []).filter((c) => String(c?.trainer_id ?? '') === trainerIdFilter)
    : raw.clients ?? []

  const shared = {
    trainings,
    clients,
    memberships: raw.memberships,
    membershipTypes: raw.membershipTypes,
    ...careInputs,
    trainerIdFilter: trainerIdFilter || null,
    holdingTrainerIds,
    noTabletTrainerIds,
    config: cqConfig,
  }

  const currentAgg = aggregateCoachQuality({
    ...shared,
    dateFrom,
    dateTo,
  })

  let previousAgg = null
  if (!skipBrief) {
    const prevRange = previousEqualPeriod(dateFrom, dateTo)
    if (prevRange) {
      try {
        const prevTrainingsRes = await fetchPagedLimited(supabaseAdmin, {
          table: 'trainings',
          select: 'id, trainer_id, client_id, date, status, data',
          clubId,
          dateFrom: prevRange.dateFrom,
          dateTo: prevRange.dateTo,
          maxRows: CLUB_STATS_MAX_TRAININGS,
        })
        let prevTrainings = prevTrainingsRes.rows
        if (trainerIdFilter) {
          prevTrainings = prevTrainings.filter((t) => String(t?.trainer_id ?? '') === trainerIdFilter)
        }
        previousAgg = aggregateCoachQuality({
          ...shared,
          trainings: prevTrainings,
          dateFrom: prevRange.dateFrom,
          dateTo: prevRange.dateTo,
        })
      } catch (prevErr) {
        console.warn('[coach-quality] previous period', prevErr)
      }
    }
  }

  // glance: бриф без previous (без второго окна trainings); full — с сравнением периодов
  const brief = buildCoachQualityMorningBrief(currentAgg, skipBrief ? null : previousAgg)
  const coachQuality = {
    ...currentAgg,
    brief,
    rules: coachQualityRulesHelp(cqConfig),
    source: 'admin_api',
  }

  if (mode === 'glance') {
    const review = Number(brief?.reviewCount) || Number(currentAgg?.statusCounts?.review) || 0
    const attention = Number(brief?.attentionCount) || Number(currentAgg?.statusCounts?.attention) || 0
    const dropped = Number(brief?.droppedCount) || 0
    const selfRow = trainerIdFilter
      ? (coachQuality.trainers ?? []).find((t) => String(t.trainerId) === trainerIdFilter)
      : null
    return {
      coachQuality,
      glance: {
        scorePct: trainerIdFilter
          ? selfRow?.scorePct ?? null
          : coachQuality.averageScorePct ?? null,
        chipLabel: brief?.chipLabel ?? null,
        hot: review > 0 || dropped > 0,
        reviewCount: review,
        attentionCount: attention,
        droppedCount: dropped,
      },
    }
  }

  return { coachQuality }
}

/** Query flag: omit / "1" / "true" → include CQ; "0" / "false" → skip. Default include. */
export function parseIncludeCqFlag(raw) {
  const v = String(raw ?? '1').trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}
