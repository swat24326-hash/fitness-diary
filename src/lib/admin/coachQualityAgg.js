/**
 * Агрегат качества тренеров за период (локальные данные → byTrainer).
 */
import { todayLocalIso } from '../dateRu.js'
import {
  COACH_QUALITY_AXIS_LABELS,
  computeCoachQualityScorePct,
  evaluateBagFlag,
  evaluateHealthPassportFlag,
  evaluateMeasuresCareFlag,
  evaluateNutritionCareFlag,
  isThinCompletedTraining,
  resolveCoachQualityStatus,
} from './coachQualityCore.js'
import { normalizeCoachQualityConfig, resolveCareSubWeights, resolveBagSubWeights } from './coachQualityConfigCore.js'

const FACTS_LIMIT = 10

/**
 * @param {object[]} measurements
 * @returns {{ lastMeasureByClientId: Record<string, string|null>, hadMeasureEverByClientId: Record<string, boolean> }}
 */
export function indexMeasurementsByClient(measurements) {
  /** @type {Record<string, string|null>} */
  const lastMeasureByClientId = {}
  /** @type {Record<string, boolean>} */
  const hadMeasureEverByClientId = {}
  for (const m of measurements ?? []) {
    const cid = String(m?.client_id ?? '')
    if (!cid) continue
    hadMeasureEverByClientId[cid] = true
    const d = String(m?.date ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    const prev = lastMeasureByClientId[cid]
    if (!prev || d > prev) lastMeasureByClientId[cid] = d
  }
  return { lastMeasureByClientId, hadMeasureEverByClientId }
}

/**
 * @param {object[]} entries
 * @returns {Record<string, object[]>}
 */
export function indexWeightEntriesByClient(entries) {
  /** @type {Record<string, object[]>} */
  const map = {}
  for (const e of entries ?? []) {
    const cid = String(e?.client_id ?? '')
    if (!cid) continue
    if (!map[cid]) map[cid] = []
    map[cid].push(e)
  }
  return map
}

/**
 * @param {{
 *   trainings?: object[],
 *   clients?: object[],
 *   memberships?: object[],
 *   membershipTypes?: object[],
 *   healthByClientId?: Record<string, object|null>,
 *   lastMeasureByClientId?: Record<string, string|null>,
 *   hadMeasureEverByClientId?: Record<string, boolean>,
 *   weightEntriesByClientId?: Record<string, object[]>,
 *   dateFrom: string,
 *   dateTo: string,
 *   todayIso?: string,
 *   trainerIdFilter?: string|null,
 *   config?: object|null,
 * }} input
 */
export function aggregateCoachQuality(input) {
  const dateFrom = String(input.dateFrom ?? '').slice(0, 10)
  const dateTo = String(input.dateTo ?? '').slice(0, 10)
  const today = String(input.todayIso ?? todayLocalIso()).slice(0, 10)
  const asOf = dateTo && dateTo < today ? dateTo : today
  const trainerFilter = input.trainerIdFilter ? String(input.trainerIdFilter) : null
  const cfg = normalizeCoachQualityConfig(input.config)
  const careW = resolveCareSubWeights(cfg)
  const bagW = resolveBagSubWeights(cfg)

  const healthBy = input.healthByClientId ?? {}
  const lastMeasureBy = input.lastMeasureByClientId ?? {}
  const hadMeasureBy = input.hadMeasureEverByClientId ?? {}
  const weightsBy = input.weightEntriesByClientId ?? {}
  const types = input.membershipTypes ?? []
  const holdingTrainerIds = input.holdingTrainerIds
  const holdingSet =
    holdingTrainerIds instanceof Set
      ? holdingTrainerIds
      : new Set((holdingTrainerIds ?? []).map(String).filter(Boolean))

  /** @type {Map<string, object[]>} */
  const memByClient = new Map()
  for (const m of input.memberships ?? []) {
    const cid = String(m?.client_id ?? '')
    if (!cid) continue
    if (!memByClient.has(cid)) memByClient.set(cid, [])
    memByClient.get(cid).push(m)
  }

  /** @type {Map<string, { completed: number, thin: number, activeIds: Set<string>, lastCompletedByClient: Map<string, string> }>} */
  const byTrainer = new Map()

  function ensureTrainer(tid) {
    if (holdingSet.has(tid)) return null
    if (!byTrainer.has(tid)) {
      byTrainer.set(tid, {
        completed: 0,
        thin: 0,
        activeIds: new Set(),
        lastCompletedByClient: new Map(),
      })
    }
    return byTrainer.get(tid)
  }

  for (const t of input.trainings ?? []) {
    if (t?.status !== 'completed') continue
    const d = String(t.date ?? '').slice(0, 10)
    if (!d || d < dateFrom || d > dateTo) continue
    const tid = String(t.trainer_id ?? '')
    if (!tid) continue
    if (trainerFilter && tid !== trainerFilter) continue
    const tr = ensureTrainer(tid)
    if (!tr) continue
    tr.completed++
    const data = t.data && typeof t.data === 'object' ? t.data : t
    if (cfg.toggleThinTrainings && isThinCompletedTraining(data)) tr.thin++
    const cid = String(t.client_id ?? '')
    if (cid) {
      tr.activeIds.add(cid)
      const prev = tr.lastCompletedByClient.get(cid)
      if (!prev || d > prev) tr.lastCompletedByClient.set(cid, d)
    }
  }

  // Тренеры с клиентами на клубе без тренировок в периоде — для оси bag
  for (const c of input.clients ?? []) {
    if (c?.archived_at) continue
    const tid = String(c.trainer_id ?? '')
    if (!tid || holdingSet.has(tid)) continue
    if (trainerFilter && tid !== trainerFilter) continue
    ensureTrainer(tid)
  }

  const trainers = []
  /** @type {Record<string, number>} */
  const statusCounts = { ok: 0, attention: 0, review: 0, insufficient_data: 0 }

  for (const [trainerId, tr] of byTrainer.entries()) {
    const facts = []
    let criticalClients = 0
    let stuckCount = 0
    let stuckDk = 0
    let stuckBz = 0
    let bagWarnCount = 0
    let staleCount = 0
    let missingPlanCount = 0
    let emptyHealthCount = 0
    let missingMeasuresCount = 0
    let careDamageSum = 0
    let bagDamageSum = 0

    const rosterClients = (input.clients ?? []).filter(
      (c) =>
        String(c?.trainer_id ?? '') === trainerId &&
        !c?.archived_at &&
        !holdingSet.has(String(c?.trainer_id ?? '')),
    )
    const clientNameById = new Map(
      (input.clients ?? []).map((c) => [String(c.id), String(c.name ?? '').trim() || String(c.id)]),
    )

    const addFact = (fact) => {
      pushFact(facts, {
        ...fact,
        clientName: clientNameById.get(String(fact.clientId)) ?? fact.clientId,
      })
    }

    for (const clientId of tr.activeIds) {
      const health = healthBy[clientId] ?? null
      const passport = cfg.toggleHealthPassport
        ? evaluateHealthPassportFlag(health)
        : { critical: false, reason: null }
      const nutRaw = evaluateNutritionCareFlag(health, weightsBy[clientId] ?? [], asOf)
      let nutMissing = false
      let nutStale = false
      if (nutRaw.critical) {
        if (nutRaw.kind === 'f1_nutrition_missing') nutMissing = cfg.toggleNutritionMissing
        else nutStale = cfg.toggleNutritionStale
      }
      const measRaw = evaluateMeasuresCareFlag(
        health,
        lastMeasureBy[clientId] ?? null,
        dateFrom,
        Boolean(hadMeasureBy[clientId]),
      )
      const measCritical = cfg.toggleMeasures && measRaw.critical

      let damage = 0
      if (passport.critical) {
        damage += careW.passport
        emptyHealthCount++
        addFact({
          kind: 'f0_health_empty',
          axis: 'care',
          clientId,
          reason: passport.reason,
        })
      }
      if (nutMissing) {
        damage += careW.nutritionMissing
        missingPlanCount++
        addFact({
          kind: 'f1_nutrition_missing',
          axis: 'care',
          clientId,
          reason: nutRaw.reason,
        })
      }
      if (nutStale) {
        damage += careW.nutritionStale
        staleCount++
        addFact({
          kind: 'f1_nutrition_stale',
          axis: 'care',
          clientId,
          reason: nutRaw.reason,
        })
      }
      if (measCritical) {
        damage += careW.measures
        missingMeasuresCount++
        addFact({
          kind: 'f2_measures',
          axis: 'care',
          clientId,
          reason: measRaw.reason,
        })
      }
      damage = Math.min(100, damage)
      if (damage > 0) criticalClients++
      careDamageSum += damage
    }

    for (const c of rosterClients) {
      const clientId = String(c.id)
      const bag = evaluateBagFlag({
        client: c,
        memList: memByClient.get(clientId) ?? [],
        membershipTypes: types,
        todayIso: asOf,
        lastCompletedIso: tr.lastCompletedByClient.get(clientId) ?? null,
      })
      let damage = 0
      const corridorWarn = bag.corridor === 'warn' && cfg.toggleInactiveCorridor
      if (corridorWarn) {
        damage += bagW.corridor
        bagWarnCount++
        addFact({
          kind: 'inactive_corridor',
          axis: 'bag',
          clientId,
          reason: bag.reason,
        })
      }
      const isStuckBz = bag.stuck && bag.kind === 'stuck_bz' && cfg.toggleStuckBz
      const isStuckDk = bag.stuck && bag.kind !== 'stuck_bz' && cfg.toggleStuckDk
      if (isStuckBz) {
        damage += bagW.stuckBz
        stuckCount++
        stuckBz++
        addFact({
          kind: 'stuck_bz',
          axis: 'bag',
          clientId,
          reason: bag.reason,
        })
      } else if (isStuckDk) {
        damage += bagW.stuckDk
        stuckCount++
        stuckDk++
        addFact({
          kind: 'stuck_dk',
          axis: 'bag',
          clientId,
          reason: bag.reason,
        })
      }
      bagDamageSum += Math.min(100, damage)
    }

    const activeClients = tr.activeIds.size
    const carePct =
      activeClients > 0 ? Math.round(100 - careDamageSum / activeClients) : null
    const depthPct =
      tr.completed > 0 ? Math.round((100 * (tr.completed - tr.thin)) / tr.completed) : null
    const bagDenom = rosterClients.length
    const bagPct = bagDenom > 0 ? Math.round(100 - bagDamageSum / bagDenom) : 100

    const resolved = resolveCoachQualityStatus({
      carePct,
      depthPct,
      stuckCount,
      bagWarnCount,
      completed: tr.completed,
      activeClients,
    })
    const scorePct = computeCoachQualityScorePct(
      {
        carePct,
        depthPct,
        bagPct,
        stuckCount,
        completed: tr.completed,
      },
      cfg,
    )

    statusCounts[resolved.status] = (statusCounts[resolved.status] ?? 0) + 1

    trainers.push({
      trainerId,
      completed: tr.completed,
      activeClients,
      carePct,
      criticalClients,
      depthPct,
      minimalCompleted: tr.thin,
      stuckCount,
      stuckDk,
      stuckBz,
      bagWarnCount,
      bagPct,
      scorePct,
      staleCount,
      missingPlanCount,
      emptyHealthCount,
      missingMeasuresCount,
      status: resolved.status,
      statusLabel: resolved.statusLabel,
      failureDirections: resolved.failureDirections,
      failureDirectionLabels: resolved.failureDirections.map(
        (a) => COACH_QUALITY_AXIS_LABELS[a] ?? a,
      ),
      facts: facts.slice(0, FACTS_LIMIT),
      factsTotal: facts.length,
    })
  }

  trainers.sort((a, b) => {
    const rank = { review: 0, attention: 1, insufficient_data: 2, ok: 3 }
    const ra = rank[a.status] ?? 9
    const rb = rank[b.status] ?? 9
    if (ra !== rb) return ra - rb
    return (a.scorePct ?? 999) - (b.scorePct ?? 999)
  })

  const withCare = trainers.filter((t) => t.status !== 'insufficient_data' && t.carePct != null)
  const medianCarePct = median(withCare.map((t) => t.carePct))
  const scored = trainers.map((t) => t.scorePct).filter((n) => Number.isFinite(n))
  const averageScorePct = scored.length
    ? Math.round(scored.reduce((s, n) => s + n, 0) / scored.length)
    : null

  return {
    asOf,
    dateFrom,
    dateTo,
    statusCounts,
    medianCarePct,
    averageScorePct,
    config: cfg,
    trainers,
    rules: null,
  }
}

function pushFact(facts, fact) {
  facts.push(fact)
}

function median(nums) {
  const a = (nums ?? []).filter((n) => Number.isFinite(n)).sort((x, y) => x - y)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2)
}
