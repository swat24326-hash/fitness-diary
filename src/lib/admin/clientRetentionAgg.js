/**
 * Агрегат KPI удержания клуба / byTrainer.
 */

import {
  RETENTION_REACTIVATION_LOOKBACK_DAYS,
  RETENTION_REACTIVATION_SUCCESS_DAYS,
  indexMembershipsByClient,
  isHardChurnInPeriod,
  isRenewalEligible,
  isRenewed,
  isSuccessfulReactivation,
  resolveCohortAnchorDate,
  tenureDays,
} from './clientRetentionCore.js'
import {
  buildCohortMembers,
  computeAverageRetentionMN,
  computeTrainerRetentionMN,
  resolveRetentionCohortMonths,
} from './clientRetentionCohortCore.js'
import { aggregateArchiveReasonMix } from './clientRetentionArchiveReasonCore.js'
import { filterRetentionPoolClients, filterRetentionUniverseClients } from './clientRetentionPoolCore.js'
import { collectNoTabletTrainerIds } from './trainerTabletModeCore.js'
import { collectHoldingTrainerIds } from './holdingClientsCore.js'

/**
 * @param {number[]} values
 * @returns {number|null}
 */
export function medianOfNumbers(values) {
  const nums = (values ?? []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!nums.length) return null
  const mid = Math.floor(nums.length / 2)
  if (nums.length % 2 === 1) return nums[mid]
  return (nums[mid - 1] + nums[mid]) / 2
}

/**
 * @typedef {{ clientId: string, restoredAt: string }} RestoreEvent
 */

/**
 * @param {{
 *   clients?: object[],
 *   memberships?: object[],
 *   trainings?: object[],
 *   membershipTypes?: object[],
 *   trainers?: object[],
 *   periodFrom: string,
 *   periodTo: string,
 *   asOf?: string,
 *   cohortMonths?: string[],
 *   restoreEvents?: RestoreEvent[],
 *   holdingTrainerIds?: Set<string>|string[],
 *   noTabletTrainerIds?: Set<string>|string[],
 * }} input
 */
export function aggregateClientRetention(input) {
  const periodFrom = String(input.periodFrom ?? '').slice(0, 10)
  const periodTo = String(input.periodTo ?? '').slice(0, 10)
  const asOf = String(input.asOf ?? periodTo).slice(0, 10)
  const membershipTypes = input.membershipTypes ?? []
  const trainers = input.trainers ?? []

  const holdingTrainerIds =
    input.holdingTrainerIds ?? collectHoldingTrainerIds(trainers)
  const noTabletTrainerIds =
    input.noTabletTrainerIds ?? collectNoTabletTrainerIds(trainers)
  const poolOpts = { holdingTrainerIds, noTabletTrainerIds }

  const pool = filterRetentionPoolClients(input.clients ?? [], poolOpts)
  const universe = filterRetentionUniverseClients(input.clients ?? [], poolOpts)
  const membershipsByClient = indexMembershipsByClient(input.memberships)
  const trainings = input.trainings ?? []

  const cohortMembers = buildCohortMembers(universe, membershipsByClient, membershipTypes, {
    ...poolOpts,
    useUniverse: true,
  })

  const cohortMonths =
    input.cohortMonths?.length ? input.cohortMonths : resolveRetentionCohortMonths(periodTo, 6)

  const retentionM3 = computeAverageRetentionMN(cohortMembers, trainings, cohortMonths, 3, asOf)

  let renewalEligible = 0
  let renewalRenewed = 0
  for (const client of pool) {
    const id = String(client.id ?? '')
    const memList = membershipsByClient.get(id) ?? []
    if (isRenewalEligible(client, memList, membershipTypes, asOf)) {
      renewalEligible += 1
      if (isRenewed(client, memList, membershipTypes, asOf)) renewalRenewed += 1
    }
  }
  const renewalRate =
    renewalEligible > 0 ? renewalRenewed / renewalEligible : null

  const hardChurnClients = universe.filter((c) => isHardChurnInPeriod(c, periodFrom, periodTo))
  const archiveRate = universe.length > 0 ? hardChurnClients.length / universe.length : null
  const archiveReasonMix = aggregateArchiveReasonMix(hardChurnClients)

  /** @type {RestoreEvent[]} */
  const restoreEvents = input.restoreEvents ?? []
  const lookbackFromParts = asOf.split('-').map(Number)
  const lookbackMs =
    Date.UTC(lookbackFromParts[0], lookbackFromParts[1] - 1, lookbackFromParts[2]) -
    RETENTION_REACTIVATION_LOOKBACK_DAYS * 86400000
  const lookbackFrom = new Date(lookbackMs).toISOString().slice(0, 10)

  let restoresInWindow = 0
  let successfulReactivations = 0
  for (const ev of restoreEvents) {
    const at = String(ev.restoredAt ?? '').slice(0, 10)
    if (at < lookbackFrom || at > asOf) continue
    restoresInWindow += 1
    if (isSuccessfulReactivation(at, trainings, ev.clientId, RETENTION_REACTIVATION_SUCCESS_DAYS)) {
      successfulReactivations += 1
    }
  }
  const reactivationRate =
    restoresInWindow > 0 ? successfulReactivations / restoresInWindow : null

  /** @type {number[]} */
  const tenureValues = []
  for (const client of universe) {
    const id = String(client.id ?? '')
    const anchor = resolveCohortAnchorDate(client, membershipsByClient.get(id) ?? [], membershipTypes)
    if (!anchor) continue
    const end = client.archived_at
      ? String(client.archived_at).slice(0, 10)
      : asOf
    const days = tenureDays(anchor, end)
    if (days != null && days > 0) tenureValues.push(days)
  }
  const medianTenureDays = medianOfNumbers(tenureValues)

  /** @type {Map<string, CohortMember[]>} */
  const byTrainerMap = new Map()
  for (const m of cohortMembers) {
    if (!m.anchorTrainerId) continue
    if (!byTrainerMap.has(m.anchorTrainerId)) byTrainerMap.set(m.anchorTrainerId, [])
    byTrainerMap.get(m.anchorTrainerId).push(m)
  }

  /** @type {Record<string, { trainerId: string, retentionM3: ReturnType<typeof computeTrainerRetentionMN> }>} */
  const byTrainer = {}
  for (const [trainerId] of byTrainerMap) {
    byTrainer[trainerId] = {
      trainerId,
      retentionM3: computeTrainerRetentionMN(
        cohortMembers,
        trainings,
        cohortMonths,
        trainerId,
        3,
        asOf,
      ),
    }
  }

  return {
    poolSize: pool.length,
    universeSize: universe.length,
    retentionM3,
    renewalRate,
    renewalEligible,
    renewalRenewed,
    archiveRate,
    archivesInPeriod: hardChurnClients.length,
    archiveReasonMix,
    reactivationRate,
    restoresInWindow,
    successfulReactivations,
    medianTenureDays,
    cohortMonths,
    byTrainer,
  }
}
