/**
 * Клубная агрегация посещаемости ПЗ (карточка Статистики).
 * Средняя посещаемость = (визиты в окне / пул) × (7 / дни_окна); окно 30 дн.
 * % без выпадения = (pool − slipped) / pool; slip = isClientAttendanceSlip.
 * Чистая логика без React/IDB.
 */

import { addDaysToIso, clampIsoDateToToday } from '../dateRu.js'
import {
  ATTENDANCE_GLANCE_WINDOW_DAYS,
  daysSinceLastCompletedVisit,
  isClientAttendanceSlip,
} from '../clientAttendanceGlanceCore.js'
import { buildClientAttendanceStats, daysInIsoRangeInclusive, resolveAttendanceRegularity } from '../clientAttendanceStatsCore.js'
import { pickUsableTypedMembershipForDate } from '../membershipRules.js'
import { filterMembershipsByHall } from '../membershipHallCore.js'
import { filterRetentionPoolClients } from './clientRetentionPoolCore.js'

const PREVIEW_LIMIT = 30

/**
 * @param {object[]} trainings
 * @returns {Record<string, object[]>}
 */
export function groupTrainingsByClientId(trainings) {
  /** @type {Record<string, object[]>} */
  const out = {}
  for (const t of trainings ?? []) {
    const id = String(t?.client_id ?? '').trim()
    if (!id) continue
    if (!out[id]) out[id] = []
    out[id].push(t)
  }
  return out
}

/**
 * @param {object[]} memberships
 * @returns {Record<string, object[]>}
 */
export function groupMembershipsByClientId(memberships) {
  /** @type {Record<string, object[]>} */
  const out = {}
  for (const m of memberships ?? []) {
    const id = String(m?.client_id ?? '').trim()
    if (!id) continue
    if (!out[id]) out[id] = []
    out[id].push(m)
  }
  return out
}

/**
 * Точный делитель недель: дни_окна / 7.
 * Не ceil(дни/7): иначе 30 дн. → 5 и средняя занижается (~14%).
 * @param {number} daysInRange
 */
export function clubAttendanceExactWeekDivisor(daysInRange) {
  const days = Number(daysInRange)
  if (!Number.isFinite(days) || days <= 0) return 1
  return days / 7
}

/** @deprecated alias → clubAttendanceExactWeekDivisor */
export function clubAttendanceWeekDivisor(windowDays = ATTENDANCE_GLANCE_WINDOW_DAYS) {
  return clubAttendanceExactWeekDivisor(windowDays)
}

/**
 * @param {number[]} values
 * @returns {number | null}
 */
export function meanOfNumbers(values) {
  const list = (values ?? []).filter((v) => Number.isFinite(Number(v)))
  if (!list.length) return null
  const sum = list.reduce((a, b) => a + Number(b), 0)
  return sum / list.length
}

/**
 * @param {number[]} values
 * @returns {number | null}
 */
export function medianOfNumbers(values) {
  const list = (values ?? [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b)
  if (!list.length) return null
  const mid = Math.floor(list.length / 2)
  return list.length % 2 === 0 ? (list[mid - 1] + list[mid]) / 2 : list[mid]
}

/**
 * @param {{
 *   clients?: object[],
 *   memberships?: object[],
 *   trainings?: object[],
 *   dateTo?: string,
 *   holdingTrainerIds?: Set<string>|string[],
 *   noTabletTrainerIds?: Set<string>|string[],
 *   lifecycleRows?: object[],
 *   trainerIdFilter?: string | null,
 *   truncated?: boolean,
 *   previewLimit?: number,
 * }} input
 */
export function aggregateClubAttendance(input = {}) {
  const dateToRaw = String(input.dateTo ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateToRaw)) {
    return emptyClubAttendance(Boolean(input.truncated))
  }
  // asOf не в будущем: иначе «месяц» с dateTo=31-го при сегодня 27-м режет живые абоны.
  const dateTo = input.clampAsOf === false ? dateToRaw : clampIsoDateToToday(dateToRaw)

  const dateFrom = addDaysToIso(dateTo, -(ATTENDANCE_GLANCE_WINDOW_DAYS - 1))
  const daysInRange = daysInIsoRangeInclusive(dateFrom, dateTo)
  const weekDivisor = clubAttendanceExactWeekDivisor(daysInRange)
  const trainerIdFilter = input.trainerIdFilter ? String(input.trainerIdFilter).trim() : ''

  let clients = Array.isArray(input.clients) ? [...input.clients] : []
  if (trainerIdFilter) {
    clients = clients.filter((c) => String(c?.trainer_id ?? '') === trainerIdFilter)
  }

  const poolOpts = {
    holdingTrainerIds: input.holdingTrainerIds,
    noTabletTrainerIds: input.noTabletTrainerIds,
    lifecycleRows: input.lifecycleRows ?? [],
  }
  const retentionPool = filterRetentionPoolClients(clients, poolOpts)

  const memByClient =
    input.memByClient && typeof input.memByClient === 'object'
      ? input.memByClient
      : groupMembershipsByClientId(input.memberships ?? [])

  const trainingsByClient =
    input.trainingsByClientId && typeof input.trainingsByClientId === 'object'
      ? input.trainingsByClientId
      : groupTrainingsByClientId(input.trainings ?? [])

  /** @type {object[]} */
  const pool = []
  /** @type {Record<string, object[]>} */
  const pzMemByClient = {}
  for (const c of retentionPool) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    const memListAll = memByClient[id] ?? memByClient[c.id] ?? []
    const memList = filterMembershipsByHall(memListAll, 'pz', c)
    if (!pickUsableTypedMembershipForDate(memList, dateTo)) continue
    pzMemByClient[id] = memList
    pool.push(c)
  }

  /** @type {Record<string, number>} */
  const byRegularity = {
    regular: 0,
    moderate: 0,
    rare: 0,
    insufficient: 0,
    none: 0,
  }

  /** @type {Array<{
   *   clientId: string,
   *   name: string,
   *   trainerId: string | null,
   *   daysSinceLastVisit: number | null,
   *   regularity: string,
   * }>} */
  const slippedRows = []

  /** @type {number[]} */
  const visitsPerWeekList = []
  /** @type {Record<string, { trainerId: string, poolSize: number, slippedCount: number, visitsPerWeekSum: number, totalVisits: number }>} */
  const byTrainerMap = {}

  let slippedCount = 0
  let totalVisitsInWindow = 0

  for (const c of pool) {
    const id = String(c.id)
    const memList = pzMemByClient[id] ?? filterMembershipsByHall(memByClient[id] ?? memByClient[c.id] ?? [], 'pz', c)
    const trainings = trainingsByClient[id] ?? trainingsByClient[c.id] ?? []
    const stats = buildClientAttendanceStats(trainings, { dateFrom, dateTo })
    const visitsN = Number(stats.summary.total) || 0
    const vpw = visitsN / weekDivisor
    // Классификация по exact weeks — как клубная средняя, не ceil из карточки клиента.
    const regularity = resolveAttendanceRegularity({
      visitsPerWeek: vpw,
      maxGapDays: stats.summary.maxGapDays,
      daysSinceLastVisit: stats.summary.daysSinceLastVisit,
      total: visitsN,
      daysInRange,
    })

    visitsPerWeekList.push(vpw)
    totalVisitsInWindow += visitsN

    if (Object.prototype.hasOwnProperty.call(byRegularity, regularity)) {
      byRegularity[regularity]++
    } else {
      byRegularity.none++
    }

    const trainerId = c.trainer_id != null ? String(c.trainer_id) : ''
    if (trainerId) {
      if (!byTrainerMap[trainerId]) {
        byTrainerMap[trainerId] = {
          trainerId,
          poolSize: 0,
          slippedCount: 0,
          visitsPerWeekSum: 0,
          totalVisits: 0,
        }
      }
      byTrainerMap[trainerId].poolSize++
      byTrainerMap[trainerId].visitsPerWeekSum += vpw
      byTrainerMap[trainerId].totalVisits += visitsN
    }

    const slipped = isClientAttendanceSlip({
      client: c,
      memList,
      today: dateTo,
      hallMode: 'pz',
      trainings,
    })
    if (slipped) {
      slippedCount++
      if (trainerId && byTrainerMap[trainerId]) byTrainerMap[trainerId].slippedCount++
      const days = daysSinceLastCompletedVisit(trainings, dateTo)
      slippedRows.push({
        clientId: id,
        name: String(c.name ?? '').trim() || '—',
        trainerId: trainerId || null,
        daysSinceLastVisit: days,
        regularity,
      })
    }
  }

  slippedRows.sort((a, b) => {
    const da = a.daysSinceLastVisit == null ? 9999 : a.daysSinceLastVisit
    const db = b.daysSinceLastVisit == null ? 9999 : b.daysSinceLastVisit
    if (db !== da) return db - da
    return a.name.localeCompare(b.name, 'ru')
  })

  const poolSize = pool.length
  const inRhythmCount = Math.max(0, poolSize - slippedCount)
  const inRhythmPct =
    poolSize > 0 ? Math.round((inRhythmCount / poolSize) * 1000) / 10 : null
  const slippedPct =
    poolSize > 0 ? Math.round((slippedCount / poolSize) * 1000) / 10 : null
  const avgVisitsPerWeek =
    poolSize > 0 ? totalVisitsInWindow / poolSize / weekDivisor : null
  const medianVisitsPerWeek = medianOfNumbers(visitsPerWeekList)
  const avgVisitsInWindow = poolSize > 0 ? totalVisitsInWindow / poolSize : null

  /** @type {Record<string, number>} */
  const byRegularityPct = {}
  for (const key of Object.keys(byRegularity)) {
    byRegularityPct[key] =
      poolSize > 0 ? Math.round((byRegularity[key] / poolSize) * 1000) / 10 : 0
  }

  const byTrainer = Object.values(byTrainerMap)
    .map((row) => {
      const inRhythm = Math.max(0, row.poolSize - row.slippedCount)
      return {
        trainerId: row.trainerId,
        poolSize: row.poolSize,
        slippedCount: row.slippedCount,
        inRhythmPct:
          row.poolSize > 0 ? Math.round((inRhythm / row.poolSize) * 1000) / 10 : null,
        avgVisitsPerWeek: row.poolSize > 0 ? row.visitsPerWeekSum / row.poolSize : null,
        totalVisits: row.totalVisits,
      }
    })
    .sort((a, b) => {
      const av = a.avgVisitsPerWeek ?? -1
      const bv = b.avgVisitsPerWeek ?? -1
      if (bv !== av) return bv - av
      return b.poolSize - a.poolSize
    })

  const limit = Number(input.previewLimit) > 0 ? Number(input.previewLimit) : PREVIEW_LIMIT

  return {
    poolSize,
    inRhythmCount,
    inRhythmPct,
    slippedCount,
    slippedPct,
    avgVisitsPerWeek,
    medianVisitsPerWeek,
    avgVisitsInWindow,
    totalVisitsInWindow,
    byRegularity,
    byRegularityPct,
    byTrainer,
    slippedPreview: slippedRows.slice(0, limit),
    asOf: dateTo,
    windowDays: daysInRange || ATTENDANCE_GLANCE_WINDOW_DAYS,
    weekDivisor,
    truncated: Boolean(input.truncated),
  }
}

/** @param {boolean} [truncated] */
function emptyClubAttendance(truncated = false) {
  return {
    poolSize: 0,
    inRhythmCount: 0,
    inRhythmPct: null,
    slippedCount: 0,
    slippedPct: null,
    avgVisitsPerWeek: null,
    medianVisitsPerWeek: null,
    avgVisitsInWindow: null,
    totalVisitsInWindow: 0,
    byRegularity: { regular: 0, moderate: 0, rare: 0, insufficient: 0, none: 0 },
    byRegularityPct: { regular: 0, moderate: 0, rare: 0, insufficient: 0, none: 0 },
    byTrainer: [],
    slippedPreview: [],
    asOf: null,
    windowDays: ATTENDANCE_GLANCE_WINDOW_DAYS,
    weekDivisor: clubAttendanceExactWeekDivisor(ATTENDANCE_GLANCE_WINDOW_DAYS),
    truncated: truncated,
  }
}

/**
 * Формат % для карточки (как retention).
 * @param {number | null | undefined} pct
 */
export function formatClubAttendancePct(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return '—'
  const n = Number(pct)
  return Number.isInteger(n) ? `${n}%` : `${n}%`
}

/**
 * Средняя посещаемость: «1.03» (трен./нед) — всегда 2 знака, без «/ нед» в цифре.
 * @param {number | null | undefined} avg
 */
export function formatClubAvgVisitsPerWeek(avg) {
  if (avg == null || !Number.isFinite(Number(avg))) return '—'
  return Number(avg).toFixed(2)
}

/**
 * Тон карточки по средней (цель ~2 / нед как у клиента).
 * @param {number | null | undefined} avg
 * @returns {'good' | 'mid' | 'low' | 'none'}
 */
export function clubAvgVisitsTone(avg) {
  if (avg == null || !Number.isFinite(Number(avg))) return 'none'
  const n = Number(avg)
  if (n >= 1.5) return 'good'
  if (n >= 1) return 'mid'
  return 'low'
}

/**
 * Payload неполный / подозрительный → нужен local/remote fallback.
 * Честные нули визитов (все не ходили) — не incomplete.
 * @param {object | null | undefined} payload
 */
export function isClubAttendancePayloadIncomplete(payload) {
  if (!payload || typeof payload !== 'object') return true
  const pool = Number(payload.poolSize) || 0
  if (pool <= 0) return false
  if (payload.truncated) return true
  if (payload.visitsDataMissing) return true
  if (payload.avgVisitsPerWeek == null || !Number.isFinite(Number(payload.avgVisitsPerWeek))) return true
  if (!payload.byRegularity || typeof payload.byRegularity !== 'object') return true
  if (!Array.isArray(payload.byTrainer)) return true
  return false
}

/**
 * Выбрать лучший из API и local.
 * @param {object | null | undefined} api
 * @param {object | null | undefined} local
 */
export function preferClubAttendancePayload(api, local) {
  if (!api && !local) return null
  if (!api) return local ?? null
  if (!local) return api

  const mergeFlags = (chosen, other) => ({
    ...chosen,
    visitsDataMissing: Boolean(chosen.visitsDataMissing) || Boolean(other?.visitsDataMissing),
    truncated: Boolean(chosen.truncated) || Boolean(other?.truncated),
  })

  const apiBad = isClubAttendancePayloadIncomplete(api)
  const localBad = isClubAttendancePayloadIncomplete(local)
  const apiVisits = Number(api.totalVisitsInWindow) || 0
  const localVisits = Number(local.totalVisitsInWindow) || 0

  if (!apiBad && !localBad && localVisits > apiVisits) return mergeFlags(local, api)
  if (!apiBad) return mergeFlags(api, local)
  if (!localBad) return mergeFlags(local, api)

  if (localVisits > apiVisits) return mergeFlags(local, api)
  if (api.avgVisitsPerWeek == null && local.avgVisitsPerWeek != null) return mergeFlags(local, api)
  if (Array.isArray(local.byTrainer) && !Array.isArray(api.byTrainer)) return mergeFlags(local, api)
  return mergeFlags(apiVisits >= localVisits ? api : local, apiVisits >= localVisits ? local : api)
}
