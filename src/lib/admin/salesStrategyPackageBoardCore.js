/**
 * Сводная «доска» пакета Стратегии: штуки, ₽ залов, доп., ур. 3.
 */

import { roundPlanRub } from './salesPlanMatrixCore.js'
import { STRATEGY_PLAN_EXTRA_FROM_PREV_PCT } from './salesPlanHallTopUpCore.js'

/**
 * @param {{
 *   renewalsSuggest?: object|null,
 *   topUpPack?: object|null,
 * }} input
 */
export function buildStrategyPackageBoard(input) {
  const suggest = input?.renewalsSuggest
  const pack = input?.topUpPack
  if (!pack?.ok) {
    if (!suggest?.ok) return { ok: false, error: 'Нет расчёта' }
    const pieces = Math.max(0, Math.trunc(Number(suggest.count) || 0))
    const hallsRub = roundPlanRub(Number(suggest.amount) || 0)
    return {
      ok: true,
      mode: 'dk_only',
      pieces,
      hallsRub,
      planExtraRub: 0,
      prevExtraRub: 0,
      planExtraPct: STRATEGY_PLAN_EXTRA_FROM_PREV_PCT,
      level3Rub: 0,
      hallsBudgetRub: 0,
      totalWithExtraRub: hallsRub,
      fittedToBudget: null,
    }
  }

  let pieces = 0
  for (const cell of Object.values(pack.cells ?? {})) {
    pieces += Math.max(0, Math.trunc(Number(cell?.count) || 0))
  }
  const hallsRub = roundPlanRub(Number(pack.totalAmount) || 0)
  const planExtraRub = roundPlanRub(Number(pack.planExtraRub) || 0)
  const prevExtraRub = roundPlanRub(Number(pack.prevExtraRub) || 0)
  const planExtraPct = Math.min(
    100,
    Math.max(0, Number(pack.planExtraPct) || STRATEGY_PLAN_EXTRA_FROM_PREV_PCT),
  )
  const level3Rub = roundPlanRub(Number(pack.level3Budget) || Number(pack.budget) || 0)
  const hallsBudgetRub = roundPlanRub(Number(pack.budget) || 0)
  const totalWithExtraRub = roundPlanRub(
    Number(pack.totalWithExtra) || hallsRub + planExtraRub,
  )

  return {
    ok: true,
    mode: 'full',
    pieces,
    hallsRub,
    planExtraRub,
    prevExtraRub,
    planExtraPct,
    level3Rub,
    hallsBudgetRub,
    totalWithExtraRub,
    fittedToBudget: level3Rub > 0 ? pack.fittedToBudget !== false : null,
  }
}
