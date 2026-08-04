/**
 * Ручная правка НК/УК в пакете Стратегии (этап утверждения).
 * ДК / доп. / ур. 3 не трогаем — только арифметика шт × чек и итоги.
 */

import { HALL_RENEWALS_HALLS } from './salesPlanHallRenewalsSuggestCore.js'
import { HALL_TOP_UP_BUDGET_TOLERANCE_RUB } from './salesPlanHallTopUpCore.js'
import { planMatrixCellRub, roundPlanRub } from './salesPlanMatrixCore.js'
import { formatRub, parseSalesCount, parseSalesMoney } from './salesReportCore.js'

const HALLS = /** @type {const} */ (['pz', 'tz', 'az'])
const EDIT_CATS = /** @type {const} */ (['nk', 'uk'])

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function parseNkUkCountInput(raw) {
  if (raw == null || raw === '') return 0
  const n = parseSalesCount(raw)
  if (Number.isNaN(n) || n < 0) return NaN
  return Math.trunc(n)
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function parseNkUkAvgInput(raw) {
  if (raw == null || raw === '') return 0
  const n = parseSalesMoney(raw)
  if (Number.isNaN(n) || n < 0) return NaN
  return roundPlanRub(n)
}

/**
 * Пересобрать byHall / totals / fitted из cells (ДК без изменений).
 * @param {object} pack результат buildHallPlanTopUpPackage (ok: true)
 */
export function rebuildTopUpPackTotalsFromCells(pack) {
  if (!pack?.ok || !pack.cells) return pack

  /** @type {Record<string, object>} */
  const byHall = {}
  let packTotal = 0
  let topUpSum = 0
  let dkSum = 0

  for (const def of HALL_RENEWALS_HALLS) {
    const hall = def.hall
    const prevRow = pack.byHall?.[hall] ?? {}
    const nkCell = pack.cells[`${hall}_nk`] ?? { count: 0, avg_check: 0, amount: 0 }
    const dkCell = pack.cells[`${hall}_dk`] ?? { count: 0, avg_check: 0, amount: 0 }
    const ukCell = pack.cells[`${hall}_uk`] ?? { count: 0, avg_check: 0, amount: 0 }

    const nk = roundPlanRub(Number(nkCell.amount) || 0)
    const dk = roundPlanRub(Number(dkCell.amount) || 0)
    const uk = roundPlanRub(Number(ukCell.amount) || 0)
    const total = roundPlanRub(nk + dk + uk)
    const topUp = roundPlanRub(nk + uk)

    byHall[hall] = {
      ...prevRow,
      label: prevRow.label || def.label,
      nk,
      dk,
      uk,
      total,
      topUp,
      renewalsDk: dk,
    }
    packTotal = roundPlanRub(packTotal + total)
    topUpSum = roundPlanRub(topUpSum + topUp)
    dkSum = roundPlanRub(dkSum + dk)
  }

  const budget = roundPlanRub(Number(pack.budget) || 0)
  const planExtraRub = roundPlanRub(Number(pack.planExtraRub) || 0)
  const tolerance =
    Number(pack.budgetTolerance) >= 0
      ? Number(pack.budgetTolerance)
      : HALL_TOP_UP_BUDGET_TOLERANCE_RUB
  const budgetDelta = budget > 0 ? roundPlanRub(packTotal - budget) : 0
  const dkFitsBudget = !(budget > 0) || dkSum <= budget + 0.01
  const withinTolerance =
    budget <= 0 || (budgetDelta >= -0.01 && budgetDelta <= tolerance + 0.01)

  return {
    ...pack,
    ok: true,
    byHall,
    totalAmount: packTotal,
    totalTopUp: topUpSum,
    totalWithExtra: roundPlanRub(packTotal + planExtraRub),
    budgetDelta,
    budgetTolerance: tolerance,
    fittedToBudget: dkFitsBudget && withinTolerance,
  }
}

/**
 * @param {object} pack
 * @param {'pz'|'tz'|'az'} hall
 * @param {'nk'|'uk'} category
 * @param {{ count?: unknown, avg_check?: unknown }} patch
 */
export function setTopUpPackNkUkCell(pack, hall, category, patch) {
  if (!pack?.ok || !pack.cells) return { ok: false, error: 'Нет пакета', pack }
  if (!HALLS.includes(hall)) return { ok: false, error: 'Неизвестный зал', pack }
  if (!EDIT_CATS.includes(category)) {
    return { ok: false, error: 'Править можно только НК и УК', pack }
  }

  const key = `${hall}_${category}`
  const cur = pack.cells[key] ?? { count: 0, avg_check: 0, amount: 0 }
  const nextCount =
    patch.count !== undefined ? parseNkUkCountInput(patch.count) : Math.trunc(Number(cur.count) || 0)
  const nextAvg =
    patch.avg_check !== undefined
      ? parseNkUkAvgInput(patch.avg_check)
      : roundPlanRub(Number(cur.avg_check) || 0)

  if (Number.isNaN(nextCount) || Number.isNaN(nextAvg)) {
    return { ok: false, error: 'Некорректные числа', pack }
  }

  const amount = planMatrixCellRub(nextCount, nextAvg)
  const cells = {
    ...pack.cells,
    [key]: {
      count: nextCount,
      avg_check: nextAvg,
      amount,
      source: 'manual_edit',
    },
  }

  const next = rebuildTopUpPackTotalsFromCells({
    ...pack,
    cells,
    manualNkUk: true,
  })
  return { ok: true, pack: next }
}

/**
 * Подпись дельты пакета к бюджету залов (ур. 3 − доп.).
 * @param {object} pack
 */
export function describeTopUpPackBudgetDeltaRu(pack) {
  if (!pack?.ok) return ''
  const budget = Number(pack.budget) || 0
  if (!(budget > 0)) return 'Цель залов не задана (нужен ур. 3).'
  const delta = Number(pack.budgetDelta) || 0
  const tol = Number(pack.budgetTolerance) || HALL_TOP_UP_BUDGET_TOLERANCE_RUB
  if (pack.fittedToBudget) {
    if (Math.abs(delta) < 0.01) return 'Пакет совпадает с целью залов.'
    if (delta > 0) return `В допуске: выше цели на ${formatRub(delta)} (до +${formatRub(tol)}).`
    return 'Пакет в допуске к цели залов.'
  }
  if (delta < -0.01) return `Не хватает ${formatRub(-delta)} до цели залов (ур. 3 − доп.).`
  return `Выше цели больше допуска (+${formatRub(tol)}): +${formatRub(delta)}.`
}
