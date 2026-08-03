/**
 * Сборка playbook из suggest (только open candidates) + пакета top-up + дней факта.
 * Уже купившие следующий абон (confirmedClosings) — не в списке закрытий: в месяце
 * им нечего покупать; остаются в suggest как счётчик «Уже купили след.».
 */

import { todayLocalIso } from '../dateRu.js'
import { roundPlanRub } from './salesPlanMatrixCore.js'
import { buildStrategyPlaybook } from './salesStrategyPlaybookCore.js'

/**
 * Только открытые кандидаты → строки закрытий для недель.
 * В списке — чек покупки (paidRub / avg / прайс), без ×% продления: % только в пакете ДК.
 * @param {object} suggest
 */
export function endingRowsFromRenewalsSuggest(suggest) {
  /** @type {Map<string, object>} */
  const byKey = new Map()

  const openList = Array.isArray(suggest?.candidates) ? suggest.candidates : []
  for (const c of openList) {
    const clientId = String(c?.clientId ?? '')
    const endDate = String(c?.endDate ?? '').slice(0, 10)
    const hall = c?.hall === 'tz' || c?.hall === 'az' ? c.hall : 'pz'
    const key = `${clientId}|${endDate}|${hall}`
    if (!clientId || !endDate || byKey.has(key)) continue
    const avg = Math.max(0, Number(c?.avgRub) || 0)
    const paidRaw = c?.paidRub
    const paid =
      paidRaw == null || paidRaw === ''
        ? null
        : Math.max(0, Number(paidRaw) || 0) || null
    byKey.set(key, {
      clientId,
      clientName: String(c?.clientName ?? '').trim(),
      phone: String(c?.phone ?? '').trim(),
      cardNumber: String(c?.cardNumber ?? c?.card_number ?? '').trim(),
      hall,
      endDate,
      // В списке — цена абона из карточки, иначе среднее/прайс. % продления не режем здесь.
      amount: roundPlanRub(paid != null ? paid : avg),
      source: c?.source || '',
      avgRub: avg,
      confirmed: false,
      factAmount: null,
    })
  }

  return [...byKey.values()]
}

/**
 * @param {{
 *   year: number,
 *   month: number,
 *   renewalsSuggest?: object|null,
 *   topUpPack?: object|null,
 *   monthDays?: object[],
 *   todayIso?: string,
 * }} opts
 */
export function buildStrategyPlaybookFromSuggest(opts) {
  const suggest = opts?.renewalsSuggest
  const pack = opts?.topUpPack
  if (!pack?.ok) {
    return { ok: false, error: 'Сначала посчитайте пакет месяца (ДК + НК/УК)' }
  }
  const endingRows = endingRowsFromRenewalsSuggest(suggest)
  return buildStrategyPlaybook({
    year: opts?.year ?? suggest?.year,
    month: opts?.month ?? suggest?.month,
    todayIso: opts?.todayIso || todayLocalIso(),
    packTotal: Number(pack.totalAmount) || Number(pack.budget) || 0,
    pack,
    endingRows,
    monthDays: opts?.monthDays ?? [],
  })
}
