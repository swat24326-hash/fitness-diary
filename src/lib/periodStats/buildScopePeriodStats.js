import { aggregateTrainings, aggregateClubClientPeriod } from '../admin/adminClubStatsService'
import { aggregateMembershipTypeStats } from '../admin/membershipTypeStatsAgg'
import { listMembershipTypesForClub } from '../membershipTypesService'
import { buildCoachQualityForScope } from '../admin/coachQualityService.js'
import { previousEqualPeriod } from '../admin/coachQualityBriefCore.js'

function trainingsInRange(trainings, dateFrom, dateTo) {
  return (trainings ?? []).filter((t) => {
    const d = String(t.date ?? '').slice(0, 10)
    return d && d >= dateFrom && d <= dateTo
  })
}

function flattenMemberships(memByClient) {
  const out = []
  for (const list of Object.values(memByClient ?? {})) {
    if (Array.isArray(list)) out.push(...list)
  }
  return out
}

/**
 * Сводка за период (клуб или тренер по своим клиентам).
 * @param {{
 *   clients: object[],
 *   trainings: object[],
 *   memberships?: object[],
 *   memByClient?: Record<string, object[]>,
 *   clubId: string,
 *   dateFrom: string,
 *   dateTo: string,
 *   trainerIdFilter?: string | null,
 *   membershipTypes?: object[],
 * }} input
 */
export async function buildScopePeriodStats(input) {
  const {
    clients,
    trainings,
    memberships: membershipsIn,
    memByClient,
    clubId,
    dateFrom,
    dateTo,
    trainerIdFilter = null,
    membershipTypes: typesIn,
  } = input

  const memberships = membershipsIn ?? flattenMemberships(memByClient)
  const inRange = trainingsInRange(trainings, dateFrom, dateTo)
  const membershipTypes = typesIn ?? (clubId ? await listMembershipTypesForClub(clubId) : [])

  let coachQuality = null
  try {
    const prev = previousEqualPeriod(dateFrom, dateTo)
    const previousTrainings = prev ? trainingsInRange(trainings, prev.dateFrom, prev.dateTo) : []
    coachQuality = await buildCoachQualityForScope({
      clients,
      trainings: inRange,
      memberships,
      clubId,
      dateFrom,
      dateTo,
      trainerIdFilter: trainerIdFilter || null,
      membershipTypes,
      previousTrainings,
    })
  } catch (e) {
    console.warn('[stats] coachQuality', e)
  }

  return {
    ...aggregateTrainings(inRange),
    ...aggregateClubClientPeriod(clients, memberships, dateFrom, dateTo),
    ...aggregateMembershipTypeStats({
      trainings: inRange,
      memberships,
      membershipTypes,
      trainerIdFilter: trainerIdFilter || null,
    }),
    coachQuality,
    source: 'local',
    fallbackReason: null,
    error: null,
  }
}
