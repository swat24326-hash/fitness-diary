/**
 * Агрегат качества тренеров за период (локальные данные → byTrainer).
 */
import { todayLocalIso } from '../dateRu.js'
import {
  COACH_QUALITY_AXIS_LABELS,
  evaluateBagFlag,
  evaluateMeasuresCareFlag,
  evaluateNutritionCareFlag,
  isThinCompletedTraining,
  resolveCoachQualityStatus,
} from './coachQualityCore.js'

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
 * }} input
 */
export function aggregateCoachQuality(input) {
  const dateFrom = String(input.dateFrom ?? '').slice(0, 10)
  const dateTo = String(input.dateTo ?? '').slice(0, 10)
  const today = String(input.todayIso ?? todayLocalIso()).slice(0, 10)
  const asOf = dateTo && dateTo < today ? dateTo : today
  const trainerFilter = input.trainerIdFilter ? String(input.trainerIdFilter) : null

  const healthBy = input.healthByClientId ?? {}
  const lastMeasureBy = input.lastMeasureByClientId ?? {}
  const hadMeasureBy = input.hadMeasureEverByClientId ?? {}
  const weightsBy = input.weightEntriesByClientId ?? {}
  const types = input.membershipTypes ?? []

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
    tr.completed++
    const data = t.data && typeof t.data === 'object' ? t.data : t
    if (isThinCompletedTraining(data)) tr.thin++
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
    if (!tid) continue
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
    let missingMeasuresCount = 0

    const rosterClients = (input.clients ?? []).filter(
      (c) => String(c?.trainer_id ?? '') === trainerId && !c?.archived_at,
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
      const nut = evaluateNutritionCareFlag(health, weightsBy[clientId] ?? [], asOf)
      const meas = evaluateMeasuresCareFlag(
        health,
        lastMeasureBy[clientId] ?? null,
        dateFrom,
        Boolean(hadMeasureBy[clientId]),
      )
      let flagged = false
      if (nut.critical) {
        flagged = true
        staleCount++
        addFact({
          kind: 'f1_nutrition_stale',
          axis: 'care',
          clientId,
          reason: nut.reason,
        })
      }
      if (meas.critical) {
        flagged = true
        missingMeasuresCount++
        addFact({
          kind: 'f2_measures',
          axis: 'care',
          clientId,
          reason: meas.reason,
        })
      }
      if (flagged) criticalClients++
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
      if (bag.corridor === 'warn') {
        bagWarnCount++
        addFact({
          kind: 'inactive_corridor',
          axis: 'bag',
          clientId,
          reason: bag.reason,
        })
      }
      if (bag.stuck) {
        stuckCount++
        if (bag.kind === 'stuck_bz') stuckBz++
        else stuckDk++
        addFact({
          kind: bag.kind ?? 'stuck_dk',
          axis: 'bag',
          clientId,
          reason: bag.reason,
        })
      }
    }

    const activeClients = tr.activeIds.size
    const carePct =
      activeClients > 0
        ? Math.round((100 * (activeClients - criticalClients)) / activeClients)
        : null
    const depthPct =
      tr.completed > 0 ? Math.round((100 * (tr.completed - tr.thin)) / tr.completed) : null
    const bagDenom = rosterClients.length
    const bagPct =
      bagDenom > 0 ? Math.round((100 * (bagDenom - stuckCount)) / bagDenom) : 100

    const resolved = resolveCoachQualityStatus({
      carePct,
      depthPct,
      stuckCount,
      bagWarnCount,
      completed: tr.completed,
      activeClients,
    })

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
      staleCount,
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
    return (a.carePct ?? 999) - (b.carePct ?? 999)
  })

  const withCare = trainers.filter((t) => t.status !== 'insufficient_data' && t.carePct != null)
  const medianCarePct = median(withCare.map((t) => t.carePct))

  return {
    asOf,
    dateFrom,
    dateTo,
    statusCounts,
    medianCarePct,
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
