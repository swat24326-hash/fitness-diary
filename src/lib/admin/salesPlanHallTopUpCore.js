/**
 * После ДК из продлений: НК/УК по долям продаж прошлого месяца;
 * цели залов укладываются в ур. 3 (с учётом пола ДК).
 */

import {
  parseSalesMoney,
  resolvePlanFinalTarget,
  sumDirectionRubFromDailyRows,
  sumMatrix3x3AmountsFromDailyRows,
  SALES_MATRIX_HALL_KEYS,
} from './salesReportCore.js'
import {
  planMatrixAvgField,
  planMatrixCellRub,
  planMatrixCountField,
  roundPlanRub,
} from './salesPlanMatrixCore.js'
import { HALL_RENEWALS_HALLS } from './salesPlanHallRenewalsSuggestCore.js'

const CATS = /** @type {const} */ (['nk', 'dk', 'uk'])
const HALLS = /** @type {const} */ (['pz', 'tz', 'az'])

/**
 * Допуск пакета к ур. 3 после округления штук × чек.
 * Правило: пакет не ниже ур. 3; сверху можно до +этой суммы (округление штук).
 */
export const HALL_TOP_UP_BUDGET_TOLERANCE_RUB = 15000

/** Доп. продажи в Стратегии: доля факта доп. за прошлый месяц. */
export const STRATEGY_PLAN_EXTRA_FROM_PREV_PCT = 70

/**
 * Ориентир plan_extra = pct% от Σ доп. продаж прошлого месяца (отчёт менеджера).
 * @param {object[]} rows
 * @param {number} [pct]
 */
export function suggestPlanExtraFromPrevMonthRows(rows, pct = STRATEGY_PLAN_EXTRA_FROM_PREV_PCT) {
  const prevExtraRub = roundPlanRub(Number(sumDirectionRubFromDailyRows(rows ?? []).extra) || 0)
  const p = Math.min(100, Math.max(0, Number(pct) || 0))
  const planExtraRub = roundPlanRub((prevExtraRub * p) / 100)
  return {
    ok: true,
    prevExtraRub,
    planExtraRub,
    pct: p,
  }
}

/**
 * Если после округления пакет ниже ур. 3 — добить ровно недобор в УК
 * (зал с наибольшим весом УК), без раздувания на лишние штуки.
 * @param {{
 *   cells: Record<string, { count: number, avg_check: number, amount: number, source?: string }>,
 *   byHall: Record<string, object>,
 *   packTotal: number,
 *   budget: number,
 *   ukWeights: { weights: Record<string, number> },
 *   prev?: ReturnType<typeof buildPrevMonthHallCategoryStats>,
 * }} input
 */
export function padPackageUkToBudgetFloor(input) {
  const budget = roundPlanRub(Math.max(0, Number(input?.budget) || 0))
  let packTotal = roundPlanRub(Math.max(0, Number(input?.packTotal) || 0))
  const cells = { ...(input?.cells ?? {}) }
  /** @type {Record<string, object>} */
  const byHall = {}
  for (const h of HALLS) {
    byHall[h] = input?.byHall?.[h] ? { ...input.byHall[h] } : { nk: 0, dk: 0, uk: 0, total: 0, topUp: 0 }
  }
  if (!(budget > 0) || packTotal + 0.01 >= budget) {
    return { cells, byHall, packTotal, padded: false, padRub: 0 }
  }

  const shortfall = roundPlanRub(budget - packTotal)
  const weights = input?.ukWeights?.weights ?? { pz: 1, tz: 1, az: 1 }
  const hall = HALLS.slice().sort((a, b) => (weights[b] || 0) - (weights[a] || 0))[0]
  const key = `${hall}_uk`
  const cur = cells[key] || { count: 0, avg_check: 0, amount: 0, source: 'floor_pad_uk' }
  const newAmount = roundPlanRub((Number(cur.amount) || 0) + shortfall)
  const count = Math.max(1, Math.trunc(Number(cur.count) || 0) || 1)
  let avg = roundPlanRub(newAmount / count)
  let next = {
    count,
    avg_check: avg,
    amount: planMatrixCellRub(count, avg),
  }
  // Если round ушёл вниз — чуть поднять avg, чтобы amount >= newAmount.
  if (next.amount + 0.01 < newAmount) {
    avg = roundPlanRub(newAmount / count + 0.01)
    next = { count, avg_check: avg, amount: planMatrixCellRub(count, avg) }
  }
  if (next.amount + 0.01 < newAmount) {
    next = { count: 1, avg_check: newAmount, amount: newAmount }
  }
  cells[key] = {
    ...next,
    source: String(cur.source || '').includes('club_pool')
      ? 'club_pool_by_hall_revenue+floor'
      : 'floor_pad_uk',
  }

  const nk = Number(cells[`${hall}_nk`]?.amount) || Number(byHall[hall].nk) || 0
  const dk = Number(byHall[hall].dk) || Number(cells[`${hall}_dk`]?.amount) || 0
  byHall[hall] = {
    ...byHall[hall],
    nk,
    dk,
    uk: next.amount,
    total: roundPlanRub(nk + dk + next.amount),
    topUp: roundPlanRub(nk + next.amount),
  }

  packTotal = 0
  for (const h of HALLS) packTotal += Number(byHall[h]?.total) || 0
  packTotal = roundPlanRub(packTotal)

  return {
    cells,
    byHall,
    packTotal,
    padded: true,
    padRub: shortfall,
  }
}

/**
 * Только дни продаж выбранного календарного месяца (report_date).
 * @param {Array<Record<string, unknown>>} rows
 * @param {number} year
 * @param {number} month
 */
export function filterDailyRowsByYearMonth(rows, year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return []
  const prefix = `${y}-${String(m).padStart(2, '0')}`
  return (rows ?? []).filter((r) => String(r?.report_date ?? '').slice(0, 7) === prefix)
}

/**
 * @param {Array<Record<string, unknown>>} rows
 */
export function buildPrevMonthHallCategoryStats(rows) {
  const amounts = sumMatrix3x3AmountsFromDailyRows(rows)
  /** @type {Record<string, number>} */
  const counts = {}
  for (const key of SALES_MATRIX_HALL_KEYS) counts[key] = 0
  for (const r of rows ?? []) {
    for (const key of SALES_MATRIX_HALL_KEYS) {
      counts[key] += Math.max(0, Math.trunc(Number(r?.[key]) || 0))
    }
  }

  /** @type {Record<string, object>} */
  const byHall = {}
  let clubTotal = 0
  /** @type {Record<string, number>} */
  const clubCat = { nk: 0, dk: 0, uk: 0 }

  for (const hall of HALLS) {
    /** @type {Record<string, { amount: number, count: number, avg: number, share: number }>} */
    const cats = {}
    let hallTotal = 0
    for (const cat of CATS) {
      const key = `${hall}_${cat}`
      const amount = roundPlanRub(Number(amounts[key]) || 0)
      const count = Math.max(0, Math.trunc(Number(counts[key]) || 0))
      const avg = count > 0 && amount > 0 ? roundPlanRub(amount / count) : 0
      cats[cat] = { amount, count, avg, share: 0 }
      hallTotal += amount
      clubCat[cat] += amount
    }
    hallTotal = roundPlanRub(hallTotal)
    clubTotal += hallTotal
    for (const cat of CATS) {
      cats[cat].share = hallTotal > 0 ? cats[cat].amount / hallTotal : 0
    }
    byHall[hall] = { total: hallTotal, cats }
  }
  clubTotal = roundPlanRub(clubTotal)
  const clubCatShare = {
    nk: clubTotal > 0 ? clubCat.nk / clubTotal : 0,
    dk: clubTotal > 0 ? clubCat.dk / clubTotal : 0,
    uk: clubTotal > 0 ? clubCat.uk / clubTotal : 0,
  }
  const hallShare = {
    pz: clubTotal > 0 ? byHall.pz.total / clubTotal : 1 / 3,
    tz: clubTotal > 0 ? byHall.tz.total / clubTotal : 1 / 3,
    az: clubTotal > 0 ? byHall.az.total / clubTotal : 1 / 3,
  }

  return { byHall, clubTotal, clubCatShare, hallShare, hasData: clubTotal > 0 }
}

/**
 * Штуки НК/УК: сумма ÷ средний чек прошлого месяца, округление до целых.
 * Чек прошлого месяца не пересчитываем — в план уходит он же.
 * @param {number} amount
 * @param {number} avgHint средний чек прошлого месяца (report_date)
 */
export function amountToCountAvg(amount, avgHint) {
  const rub = roundPlanRub(Math.max(0, Number(amount) || 0))
  if (rub <= 0) return { count: 0, avg_check: 0, amount: 0 }
  const avg = roundPlanRub(Number(avgHint) || 0)
  if (!(avg > 0)) {
    // Нет чека в прошлом месяце — одна позиция на всю сумму.
    return { count: 1, avg_check: rub, amount: rub }
  }
  const count = Math.max(1, Math.round(rub / avg))
  return { count, avg_check: avg, amount: planMatrixCellRub(count, avg) }
}

/** @param {ReturnType<typeof buildPrevMonthHallCategoryStats>} prev @param {'nk'|'uk'|'dk'} cat */
function clubCategoryAvg(prev, cat) {
  let amount = 0
  let count = 0
  for (const h of HALLS) {
    amount += Number(prev?.byHall?.[h]?.cats?.[cat]?.amount) || 0
    count += Math.max(0, Math.trunc(Number(prev?.byHall?.[h]?.cats?.[cat]?.count) || 0))
  }
  return count > 0 && amount > 0 ? roundPlanRub(amount / count) : 0
}

/**
 * Веса залов по штукам категории прошлого месяца (например НК 20:10:5).
 * @param {ReturnType<typeof buildPrevMonthHallCategoryStats>} prev
 * @param {'nk'|'uk'} cat
 */
export function hallCountWeights(prev, cat) {
  /** @type {Record<string, number>} */
  const counts = { pz: 0, tz: 0, az: 0 }
  let sum = 0
  for (const h of HALLS) {
    const c = Math.max(0, Math.trunc(Number(prev?.byHall?.[h]?.cats?.[cat]?.count) || 0))
    counts[h] = c
    sum += c
  }
  if (sum <= 0) {
    let amtSum = 0
    /** @type {Record<string, number>} */
    const amounts = { pz: 0, tz: 0, az: 0 }
    for (const h of HALLS) {
      const a = Math.max(0, Number(prev?.byHall?.[h]?.cats?.[cat]?.amount) || 0)
      amounts[h] = a
      amtSum += a
    }
    if (amtSum > 0) {
      return {
        weights: {
          pz: amounts.pz / amtSum,
          tz: amounts.tz / amtSum,
          az: amounts.az / amtSum,
        },
        counts,
        total: 0,
        source: 'prev_amount',
      }
    }
    return {
      weights: { pz: 1 / 3, tz: 1 / 3, az: 1 / 3 },
      counts,
      total: 0,
      source: 'equal',
    }
  }
  return {
    weights: {
      pz: counts.pz / sum,
      tz: counts.tz / sum,
      az: counts.az / sum,
    },
    counts,
    total: sum,
    source: 'prev_count',
  }
}

/**
 * Общий добор клуба → пулы НК и УК по штукам прошлого месяца.
 * @param {number} remainderRub
 * @param {ReturnType<typeof buildPrevMonthHallCategoryStats>} prev
 */
export function splitClubTopUpIntoNkUk(remainderRub, prev) {
  const rem = roundPlanRub(Math.max(0, Number(remainderRub) || 0))
  if (!(rem > 0)) {
    return { nkPool: 0, ukPool: 0, source: 'empty' }
  }
  let nkC = 0
  let ukC = 0
  for (const h of HALLS) {
    nkC += Math.max(0, Math.trunc(Number(prev?.byHall?.[h]?.cats?.nk?.count) || 0))
    ukC += Math.max(0, Math.trunc(Number(prev?.byHall?.[h]?.cats?.uk?.count) || 0))
  }
  let den = nkC + ukC
  if (den > 0) {
    const nkPool = roundPlanRub(rem * (nkC / den))
    return { nkPool, ukPool: roundPlanRub(rem - nkPool), source: 'prev_count' }
  }
  let nkA = 0
  let ukA = 0
  for (const h of HALLS) {
    nkA += Math.max(0, Number(prev?.byHall?.[h]?.cats?.nk?.amount) || 0)
    ukA += Math.max(0, Number(prev?.byHall?.[h]?.cats?.uk?.amount) || 0)
  }
  den = nkA + ukA
  if (den > 0) {
    const nkPool = roundPlanRub(rem * (nkA / den))
    return { nkPool, ukPool: roundPlanRub(rem - nkPool), source: 'prev_amount' }
  }
  const nkPool = roundPlanRub(rem * 0.5)
  return { nkPool, ukPool: roundPlanRub(rem - nkPool), source: 'equal' }
}

/**
 * Добор после ДК: по доле выручки зала за прошлый месяц, внутри зала — НК/УК по ₽.
 * @param {number} remainderRub
 * @param {ReturnType<typeof buildPrevMonthHallCategoryStats>} prev
 */
export function allocateNkUkByHallRevenueShare(remainderRub, prev) {
  const rem = roundPlanRub(Math.max(0, Number(remainderRub) || 0))
  const weights =
    prev?.hasData && prev.hallShare
      ? {
          pz: Number(prev.hallShare.pz) || 0,
          tz: Number(prev.hallShare.tz) || 0,
          az: Number(prev.hallShare.az) || 0,
        }
      : { pz: 1 / 3, tz: 1 / 3, az: 1 / 3 }
  const hallTopUp = allocatePoolByHallWeights(rem, weights)

  /** @type {Record<string, { nk: number, uk: number }>} */
  const byHall = {
    pz: { nk: 0, uk: 0 },
    tz: { nk: 0, uk: 0 },
    az: { nk: 0, uk: 0 },
  }
  let nkPool = 0
  let ukPool = 0

  for (const h of HALLS) {
    const hallRem = roundPlanRub(Number(hallTopUp[h]) || 0)
    if (!(hallRem > 0)) continue
    const nkA = Math.max(0, Number(prev?.byHall?.[h]?.cats?.nk?.amount) || 0)
    const ukA = Math.max(0, Number(prev?.byHall?.[h]?.cats?.uk?.amount) || 0)
    const den = nkA + ukA
    let nk = 0
    let uk = 0
    if (den > 0) {
      nk = roundPlanRub(hallRem * (nkA / den))
      uk = roundPlanRub(hallRem - nk)
    } else {
      const clubNk = Math.max(0, Number(prev?.clubCatShare?.nk) || 0)
      const clubUk = Math.max(0, Number(prev?.clubCatShare?.uk) || 0)
      const clubDen = clubNk + clubUk
      if (clubDen > 0) {
        nk = roundPlanRub(hallRem * (clubNk / clubDen))
        uk = roundPlanRub(hallRem - nk)
      } else {
        nk = roundPlanRub(hallRem * 0.5)
        uk = roundPlanRub(hallRem - nk)
      }
    }
    byHall[h] = { nk, uk }
    nkPool += nk
    ukPool += uk
  }

  return {
    byHall,
    hallTopUp,
    weights,
    nkPool: roundPlanRub(nkPool),
    ukPool: roundPlanRub(ukPool),
    source: prev?.hasData ? 'prev_hall_revenue' : 'equal',
  }
}

/**
 * Разложить пул по залам (последний зал забирает копейки).
 * @param {number} poolRub
 * @param {{ pz: number, tz: number, az: number }} weights
 */
export function allocatePoolByHallWeights(poolRub, weights) {
  const pool = roundPlanRub(Math.max(0, Number(poolRub) || 0))
  /** @type {Record<string, number>} */
  const out = { pz: 0, tz: 0, az: 0 }
  if (!(pool > 0)) return out
  let left = pool
  for (let i = 0; i < HALLS.length; i++) {
    const h = HALLS[i]
    if (i === HALLS.length - 1) {
      out[h] = roundPlanRub(left)
    } else {
      const part = roundPlanRub(pool * (Number(weights?.[h]) || 0))
      out[h] = part
      left = roundPlanRub(left - part)
    }
  }
  return out
}

/**
 * Бюджет Стратегии: сначала финальный план (ур. 3 / max уровней), не сумма направлений.
 * Иначе после «В план» направления = залы (уже L3−доп.) и повторный «Посчитать» снова вычел бы доп.
 * @param {Record<string, string>} planForm
 * @param {ReturnType<typeof buildPrevMonthHallCategoryStats>} prev
 */
export function resolveHallPlanTargetsRub(planForm, prev) {
  const l1 = parseSalesMoney(planForm?.plan_level_1)
  const l2 = parseSalesMoney(planForm?.plan_level_2)
  const l3 = parseSalesMoney(planForm?.plan_level_3)
  const levelBudget = resolvePlanFinalTarget({
    plan_level_1: Number.isNaN(l1) ? 0 : l1,
    plan_level_2: Number.isNaN(l2) ? 0 : l2,
    plan_level_3: Number.isNaN(l3) ? 0 : l3,
  })

  if (levelBudget > 0 && prev?.hasData) {
    return {
      pz: roundPlanRub(levelBudget * (prev.hallShare.pz || 0)),
      tz: roundPlanRub(levelBudget * (prev.hallShare.tz || 0)),
      az: roundPlanRub(levelBudget * (prev.hallShare.az || 0)),
      budget: roundPlanRub(levelBudget),
      source: 'plan_level_3_split',
    }
  }
  if (levelBudget > 0) {
    const third = roundPlanRub(levelBudget / 3)
    return {
      pz: third,
      tz: third,
      az: roundPlanRub(levelBudget - 2 * third),
      budget: roundPlanRub(levelBudget),
      source: 'plan_level_3_equal',
    }
  }

  const pz = (() => {
    const n = parseSalesMoney(planForm?.plan_pz)
    return Number.isNaN(n) ? 0 : roundPlanRub(n)
  })()
  const tz = (() => {
    const n = parseSalesMoney(planForm?.plan_tz)
    return Number.isNaN(n) ? 0 : roundPlanRub(n)
  })()
  const az = (() => {
    const n = parseSalesMoney(planForm?.plan_az)
    return Number.isNaN(n) ? 0 : roundPlanRub(n)
  })()
  if (pz + tz + az > 0) {
    return {
      pz,
      tz,
      az,
      budget: roundPlanRub(pz + tz + az),
      source: 'plan_directions',
    }
  }
  return { pz: 0, tz: 0, az: 0, budget: 0, source: 'none' }
}

/**
 * Поднять цели до пола ДК, затем сжать slack других залов, чтобы Σ = budget.
 * @param {Record<string, number>} rawTargets
 * @param {Record<string, number>} dkByHall
 * @param {number} budget
 */
export function rebalanceHallTargetsToBudget(rawTargets, dkByHall, budget) {
  const budgetRub = roundPlanRub(Math.max(0, Number(budget) || 0))
  /** @type {Record<string, number>} */
  const targets = {}
  /** @type {Record<string, number>} */
  const floors = {}
  for (const h of HALLS) {
    floors[h] = roundPlanRub(Math.max(0, Number(dkByHall?.[h]) || 0))
    targets[h] = roundPlanRub(Math.max(Number(rawTargets?.[h]) || 0, floors[h]))
  }

  if (!(budgetRub > 0)) {
    return { targets, fitted: true, overflow: 0, budget: 0 }
  }

  let sum = roundPlanRub(targets.pz + targets.tz + targets.az)
  let overflow = roundPlanRub(sum - budgetRub)
  if (overflow <= 0) {
    // Добить копейки дрейфа до бюджета на зал с наибольшим slack
    const drift = roundPlanRub(budgetRub - sum)
    if (drift > 0) {
      let best = 'pz'
      let bestSlack = targets.pz - floors.pz
      for (const h of HALLS) {
        const s = targets[h] - floors[h]
        if (s > bestSlack) {
          best = h
          bestSlack = s
        }
      }
      targets[best] = roundPlanRub(targets[best] + drift)
    }
    return { targets, fitted: true, overflow: 0, budget: budgetRub }
  }

  /** @type {Record<string, number>} */
  const slack = {}
  let totalSlack = 0
  for (const h of HALLS) {
    slack[h] = Math.max(0, roundPlanRub(targets[h] - floors[h]))
    totalSlack = roundPlanRub(totalSlack + slack[h])
  }

  if (totalSlack <= 0) {
    return { targets, fitted: false, overflow, budget: budgetRub }
  }

  if (totalSlack < overflow) {
    for (const h of HALLS) targets[h] = floors[h]
    sum = roundPlanRub(targets.pz + targets.tz + targets.az)
    return {
      targets,
      fitted: false,
      overflow: roundPlanRub(sum - budgetRub),
      budget: budgetRub,
    }
  }

  for (const h of HALLS) {
    if (slack[h] <= 0) continue
    const cut = roundPlanRub(overflow * (slack[h] / totalSlack))
    targets[h] = roundPlanRub(Math.max(floors[h], targets[h] - cut))
  }

  sum = roundPlanRub(targets.pz + targets.tz + targets.az)
  let drift = roundPlanRub(sum - budgetRub)
  if (Math.abs(drift) >= 0.01) {
    let best = 'pz'
    let bestSlack = targets.pz - floors.pz
    for (const h of HALLS) {
      const s = targets[h] - floors[h]
      if (s >= bestSlack) {
        best = h
        bestSlack = s
      }
    }
    if (drift > 0 && bestSlack >= drift) {
      targets[best] = roundPlanRub(targets[best] - drift)
      drift = 0
    } else if (drift < 0) {
      targets[best] = roundPlanRub(targets[best] - drift)
      drift = 0
    }
  }

  sum = roundPlanRub(targets.pz + targets.tz + targets.az)
  overflow = roundPlanRub(sum - budgetRub)
  return {
    targets,
    fitted: Math.abs(overflow) < 1,
    overflow: Math.abs(overflow) < 1 ? 0 : overflow,
    budget: budgetRub,
  }
}

/**
 * @param {{
 *   renewalsSuggest: object,
 *   prevMonthRows?: object[],
 *   planForm?: Record<string, string>,
 *   prevMonthYear?: number,
 *   prevMonthMonth?: number,
 * }} input
 */
export function buildHallPlanTopUpPackage(input) {
  const renewals = input?.renewalsSuggest
  if (!renewals?.ok || !renewals.byHall) {
    return { ok: false, error: 'Сначала посчитайте продления ДК' }
  }

  const y = Number(input?.prevMonthYear)
  const m = Number(input?.prevMonthMonth)
  const saleRows =
    Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12
      ? filterDailyRowsByYearMonth(input?.prevMonthRows ?? [], y, m)
      : [...(input?.prevMonthRows ?? [])]

  const prev = buildPrevMonthHallCategoryStats(saleRows)
  const rawTargets = resolveHallPlanTargetsRub(input?.planForm ?? {}, prev)
  const extraSuggest = suggestPlanExtraFromPrevMonthRows(saleRows)
  const planExtraRub = extraSuggest.planExtraRub
  const level3Budget = roundPlanRub(rawTargets.budget || 0)
  // Сначала доп. (70% прошлого месяца), затем залы добирают остаток до ур. 3 / направлений.
  const budget = level3Budget > 0 ? roundPlanRub(Math.max(0, level3Budget - planExtraRub)) : 0

  /** @type {Record<string, number>} */
  const dkByHall = {}
  let dkSum = 0
  for (const h of HALLS) {
    dkByHall[h] = roundPlanRub(Number(renewals.byHall?.[h]?.amount) || 0)
    dkSum += dkByHall[h]
  }
  dkSum = roundPlanRub(dkSum)

  // Общий добор клуба (не «хвост» внутри зала — иначе всё оседает в ПЗ).
  const clubRemainder = budget > 0 ? roundPlanRub(Math.max(0, budget - dkSum)) : 0
  const dkFitsBudget = !(budget > 0) || dkSum <= budget + 0.01

  // Добор по доле ₽ зала (прошлый месяц); внутри зала НК/УК по их ₽.
  const revenueAlloc = allocateNkUkByHallRevenueShare(clubRemainder, prev)
  const nkByHallIdeal = {
    pz: revenueAlloc.byHall.pz.nk,
    tz: revenueAlloc.byHall.tz.nk,
    az: revenueAlloc.byHall.az.nk,
  }
  const ukByHallIdeal = {
    pz: revenueAlloc.byHall.pz.uk,
    tz: revenueAlloc.byHall.tz.uk,
    az: revenueAlloc.byHall.az.uk,
  }
  const catSplit = {
    nkPool: revenueAlloc.nkPool,
    ukPool: revenueAlloc.ukPool,
    source: revenueAlloc.source,
  }
  const nkWeights = {
    weights: revenueAlloc.weights,
    counts: { pz: 0, tz: 0, az: 0 },
    total: 0,
    source: revenueAlloc.source,
  }
  const ukWeights = { ...nkWeights }

  const targets = {
    ...rawTargets,
    pz: roundPlanRub(dkByHall.pz + nkByHallIdeal.pz + ukByHallIdeal.pz),
    tz: roundPlanRub(dkByHall.tz + nkByHallIdeal.tz + ukByHallIdeal.tz),
    az: roundPlanRub(dkByHall.az + nkByHallIdeal.az + ukByHallIdeal.az),
    budget,
    level3Budget,
    planExtraRub,
    rebalanced: false,
    fitted: dkFitsBudget,
    distribution: 'prev_hall_revenue',
  }

  /** @type {Record<string, { count: number, avg_check: number, amount: number, source: string }>} */
  const cells = {}
  /** @type {Record<string, object>} */
  const byHall = {}

  for (const def of HALL_RENEWALS_HALLS) {
    const hall = def.hall
    const dkRenew = renewals.byHall[hall] ?? {}
    const dkAmount = dkByHall[hall]
    const dkCount = Math.max(0, Math.trunc(Number(dkRenew.count) || 0))
    const dkAvg = roundPlanRub(Number(dkRenew.avg_check) || 0)
    const hallPrev = prev.byHall[hall]

    const nkAmount = roundPlanRub(nkByHallIdeal[hall] || 0)
    const ukAmount = roundPlanRub(ukByHallIdeal[hall] || 0)
    const nkAvgHint = hallPrev?.cats?.nk?.avg || clubCategoryAvg(prev, 'nk') || 0
    const ukAvgHint = hallPrev?.cats?.uk?.avg || clubCategoryAvg(prev, 'uk') || 0
    const nkCell = amountToCountAvg(nkAmount, nkAvgHint)
    const ukCell = amountToCountAvg(ukAmount, ukAvgHint)
    const dkAvgForForm =
      dkCount > 0 && dkAmount > 0 ? roundPlanRub(dkAmount / dkCount) : dkAvg
    const dkCell = {
      count: dkCount,
      avg_check: dkAvgForForm,
      amount: dkAmount,
      source: 'renewals',
    }

    const planTarget = roundPlanRub(Number(targets[hall]) || 0)
    const packageAmount = roundPlanRub(nkCell.amount + dkAmount + ukCell.amount)

    cells[`${hall}_nk`] = {
      ...nkCell,
      source: 'club_pool_by_hall_revenue',
    }
    cells[`${hall}_dk`] = dkCell
    cells[`${hall}_uk`] = {
      ...ukCell,
      source: 'club_pool_by_hall_revenue',
    }

    byHall[hall] = {
      label: def.label,
      planTarget,
      renewalsDk: dkAmount,
      nk: nkCell.amount,
      dk: dkAmount,
      uk: ukCell.amount,
      total: packageAmount,
      topUp: roundPlanRub(nkCell.amount + ukCell.amount),
      overshootDk: 0,
      nkWeight: nkWeights.weights[hall],
      ukWeight: ukWeights.weights[hall],
      prevNkCount: nkWeights.counts[hall],
      prevUkCount: ukWeights.counts[hall],
    }
  }

  let packTotal = 0
  for (const h of HALLS) {
    packTotal += Number(byHall[h]?.total) || 0
  }
  packTotal = roundPlanRub(packTotal)

  const padded = padPackageUkToBudgetFloor({
    cells,
    byHall,
    packTotal,
    budget,
    ukWeights,
    prev,
  })
  const cellsOut = padded.cells
  const byHallOut = padded.byHall
  packTotal = padded.packTotal

  let topUpSum = 0
  for (const h of HALLS) {
    topUpSum += Number(byHallOut[h]?.topUp) || 0
  }
  const totalTopUp = roundPlanRub(topUpSum)

  const budgetDelta = budget > 0 ? roundPlanRub(packTotal - budget) : 0
  // Не ниже ур. 3; сверху — допуск на округление штук.
  const withinTolerance =
    budget <= 0 ||
    (budgetDelta >= -0.01 && budgetDelta <= HALL_TOP_UP_BUDGET_TOLERANCE_RUB + 0.01)
  const fittedToBudget = dkFitsBudget && withinTolerance

  const totalWithExtra = roundPlanRub(packTotal + planExtraRub)

  return {
    ok: true,
    cells: cellsOut,
    byHall: byHallOut,
    prev,
    targets,
    nkWeights,
    ukWeights,
    catSplit,
    clubRemainder,
    floorPadded: Boolean(padded.padded),
    floorPadRub: Number(padded.padRub) || 0,
    prevSalesYear: Number.isFinite(y) ? y : null,
    prevSalesMonth: Number.isFinite(m) ? m : null,
    prevSalesDays: saleRows.length,
    totalAmount: packTotal,
    totalTopUp,
    totalWithExtra,
    planExtraRub,
    prevExtraRub: extraSuggest.prevExtraRub,
    planExtraPct: extraSuggest.pct,
    level3Budget,
    budget,
    budgetDelta,
    budgetTolerance: HALL_TOP_UP_BUDGET_TOLERANCE_RUB,
    fittedToBudget,
    renewalsCount: Math.trunc(Number(renewals.count) || 0),
    renewalsAmount: roundPlanRub(Number(renewals.amount) || 0),
  }
}

/**
 * @param {Record<string, string>} planForm
 * @param {object} pack результат buildHallPlanTopUpPackage
 * @param {{ syncDirections?: boolean, syncLevel3?: boolean }} [opts]
 */
export function applyHallPlanTopUpToPlanForm(planForm, pack, opts = {}) {
  const base = planForm && typeof planForm === 'object' ? { ...planForm } : {}
  if (!pack?.ok || !pack.cells) return base

  for (const [cellKey, cell] of Object.entries(pack.cells)) {
    const count = Math.max(0, Math.trunc(Number(cell.count) || 0))
    const avg = roundPlanRub(Number(cell.avg_check) || 0)
    base[planMatrixCountField(cellKey)] = count > 0 ? String(count) : ''
    base[planMatrixAvgField(cellKey)] = avg > 0 ? String(avg) : ''
  }

  if (opts.syncDirections !== false) {
    for (const hall of HALLS) {
      const row = pack.byHall?.[hall]
      if (!row) continue
      // Направления = сумма ячеек (штуки×чек), чтобы сходилась математика.
      const dirRub = roundPlanRub(row.total)
      base[`plan_${hall}`] = dirRub > 0 ? String(dirRub) : ''
    }
    const extra = roundPlanRub(Number(pack.planExtraRub) || 0)
    base.plan_extra = extra > 0 ? String(extra) : ''
  }

  // Ур. 3 в форме — полный бюджет клуба (залы + доп.), не урезанный hall-budget.
  const level3Keep = roundPlanRub(Number(pack.level3Budget) || 0)
  if (opts.syncLevel3 && level3Keep > 0) {
    base.plan_level_3 = String(level3Keep)
  } else if (opts.syncLevel3 && pack.budget > 0) {
    base.plan_level_3 = String(roundPlanRub(pack.budget))
  } else if (opts.syncLevel3) {
    const sum = roundPlanRub(Number(pack.totalWithExtra) || Number(pack.totalAmount) || 0)
    if (sum > 0) base.plan_level_3 = String(sum)
  }

  return base
}

/**
 * @param {object} pack
 */
export function formatHallPlanTopUpSummaryRu(pack) {
  if (!pack?.ok) return ''
  const fmt = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n))
  const parts = [`пакет залов ${fmt(pack.totalAmount)} ₽`]
  const extra = Number(pack.planExtraRub) || 0
  if (extra > 0) {
    parts.push(
      `доп. ${fmt(extra)} ₽ (${pack.planExtraPct || STRATEGY_PLAN_EXTRA_FROM_PREV_PCT}% от ${fmt(pack.prevExtraRub || 0)})`,
    )
  }
  const level3 = Number(pack.level3Budget) || Number(pack.budget) || 0
  if (level3 > 0) {
    parts.push(`ур. 3 ${fmt(level3)} ₽`)
    if (pack.budget > 0 && pack.budget !== level3) {
      parts.push(`залы до ${fmt(pack.budget)} ₽`)
    }
    const delta = Number(pack.budgetDelta) || 0
    if (Math.abs(delta) >= 1) {
      const sign = delta > 0 ? '+' : '−'
      parts.push(`Δ залы ${sign}${fmt(Math.abs(delta))} ₽ (допуск ${fmt(pack.budgetTolerance || HALL_TOP_UP_BUDGET_TOLERANCE_RUB)})`)
    }
  }
  if (pack.totalTopUp > 0) {
    parts.push(`НК+УК ${fmt(pack.totalTopUp)} ₽`)
  }
  if (pack.prevSalesYear && pack.prevSalesMonth) {
    parts.push(
      `продажи ${String(pack.prevSalesMonth).padStart(2, '0')}.${pack.prevSalesYear} (${pack.prevSalesDays} дн.)`,
    )
  }
  if (pack.budget > 0) {
    if (pack.fittedToBudget === false) {
      if (pack.targets?.fitted === false) {
        parts.push('не уместились — ДК выше ур. 3')
      } else if ((Number(pack.budgetDelta) || 0) < -0.01) {
        parts.push('пакет ниже ур. 3')
      } else {
        parts.push('пакет выше ур. 3 больше допуска')
      }
    } else {
      parts.push('не ниже ур. 3 (допуск сверху +15 000)')
    }
  }
  if (pack.floorPadded && (Number(pack.floorPadRub) || 0) > 0) {
    parts.push(`добили УК ${fmt(pack.floorPadRub)} ₽ до ур. 3`)
  }
  if (
    (pack.targets?.distribution === 'prev_hall_revenue' ||
      pack.nkWeights?.source === 'prev_hall_revenue') &&
    pack.nkWeights?.weights
  ) {
    const w = pack.nkWeights.weights
    const pct = (x) => Math.round((Number(x) || 0) * 100)
    parts.push(`доли залов ${pct(w.pz)}/${pct(w.tz)}/${pct(w.az)}%`)
  } else if (pack.nkWeights?.source === 'prev_count' && pack.nkWeights.total > 0) {
    parts.push(
      `НК шт. ${pack.nkWeights.counts.pz}:${pack.nkWeights.counts.tz}:${pack.nkWeights.counts.az}`,
    )
  }
  const targetSource = pack.targets?.source
  parts.push(
    `цель: ${!targetSource || targetSource === 'none' ? 'без плана' : targetSource}`,
  )
  return parts.join(' · ')
}
