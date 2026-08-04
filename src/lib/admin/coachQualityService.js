/**
 * Загрузка входов для aggregateCoachQuality (IDB / батч health).
 */
import { loadAdminHealthCardsByClientIds } from './adminHealthCardService.js'
import { listMembershipTypesForClub } from '../membershipTypesService.js'
import {
  listMeasurementsByClientId,
  listWeightEntriesByClientId,
} from '../localDbClubQuery.js'
import {
  aggregateCoachQuality,
  indexMeasurementsByClient,
  indexWeightEntriesByClient,
} from './coachQualityAgg.js'
import { coachQualityRulesHelp } from './coachQualityCore.js'
import { loadCoachQualityConfigForClub } from './coachQualitySettingsService.js'
import {
  buildCoachQualityMorningBrief,
  previousEqualPeriod,
} from './coachQualityBriefCore.js'

export { indexMeasurementsByClient, indexWeightEntriesByClient }

const LOAD_CHUNK = 24

/**
 * @param {string[]} clientIds
 * @param {(id: string) => Promise<object[]>} loader
 */
async function loadRowsByClientIds(clientIds, loader) {
  const out = []
  for (let i = 0; i < clientIds.length; i += LOAD_CHUNK) {
    const chunk = clientIds.slice(i, i + LOAD_CHUNK)
    const parts = await Promise.all(chunk.map((id) => loader(id).catch(() => [])))
    for (const rows of parts) out.push(...rows)
  }
  return out
}

/**
 * @param {{
 *   clients: object[],
 *   trainings: object[],
 *   memberships: object[],
 *   clubId?: string|null,
 *   dateFrom: string,
 *   dateTo: string,
 *   trainerIdFilter?: string|null,
 *   membershipTypes?: object[],
 *   holdingTrainerIds?: Set<string>|string[]|null,
 *   noTabletTrainerIds?: Set<string>|string[]|null,
 *   previousTrainings?: object[]|null,
 *   trainerNameById?: Record<string, string>,
 *   skipBrief?: boolean,
 *   config?: object|null,
 * }} input
 */
export async function buildCoachQualityForScope(input) {
  const clients = input.clients ?? []
  const clientIds = [...new Set(clients.map((c) => String(c.id)).filter(Boolean))]
  const [{ healthByClientId }, membershipTypes, measures, weights, config] = await Promise.all([
    loadAdminHealthCardsByClientIds(clientIds),
    input.membershipTypes?.length
      ? Promise.resolve(input.membershipTypes)
      : input.clubId
        ? listMembershipTypesForClub(input.clubId)
        : Promise.resolve([]),
    loadRowsByClientIds(clientIds, listMeasurementsByClientId),
    loadRowsByClientIds(clientIds, listWeightEntriesByClientId),
    input.config
      ? Promise.resolve(input.config)
      : input.clubId
        ? loadCoachQualityConfigForClub(input.clubId)
        : Promise.resolve(null),
  ])

  const { lastMeasureByClientId, hadMeasureEverByClientId } = indexMeasurementsByClient(measures)
  const weightEntriesByClientId = indexWeightEntriesByClient(weights)
  const shared = {
    clients,
    memberships: input.memberships,
    membershipTypes,
    healthByClientId,
    lastMeasureByClientId,
    hadMeasureEverByClientId,
    weightEntriesByClientId,
    trainerIdFilter: input.trainerIdFilter ?? null,
    holdingTrainerIds: input.holdingTrainerIds,
    noTabletTrainerIds: input.noTabletTrainerIds,
    config,
  }

  const agg = aggregateCoachQuality({
    ...shared,
    trainings: input.trainings,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  })

  let brief = null
  if (!input.skipBrief) {
    const prevRange = previousEqualPeriod(input.dateFrom, input.dateTo)
    let previousAgg = null
    if (prevRange) {
      const prevTrainings =
        input.previousTrainings ??
        (input.trainings ?? []).filter((t) => {
          const d = String(t?.date ?? '').slice(0, 10)
          return d >= prevRange.dateFrom && d <= prevRange.dateTo
        })
      previousAgg = aggregateCoachQuality({
        ...shared,
        trainings: prevTrainings,
        dateFrom: prevRange.dateFrom,
        dateTo: prevRange.dateTo,
      })
    }
    brief = buildCoachQualityMorningBrief(agg, previousAgg, {
      trainerNameById: input.trainerNameById,
    })
  }

  return {
    ...agg,
    brief,
    rules: coachQualityRulesHelp(config),
  }
}
