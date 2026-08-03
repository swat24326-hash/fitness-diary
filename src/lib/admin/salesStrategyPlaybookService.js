/**
 * Сборка playbook из suggest (candidates + confirmed) + пакета top-up + дней факта.
 */

import { todayLocalIso } from '../dateRu.js'
import { clampRenewalPct } from './salesPlanHallRenewalsSuggestCore.js'
import { roundPlanRub } from './salesPlanMatrixCore.js'
import { buildStrategyPlaybook } from './salesStrategyPlaybookCore.js'

/**
 * Кандидаты + подтверждённые продления → строки закрытий для недель.
 * Open: ориентир × % продления. Confirmed: ориентир чека без ×%, + factAmount.
 * @param {object} suggest
 */
export function endingRowsFromRenewalsSuggest(suggest) {
  const pct = clampRenewalPct(suggest?.renewalPct)
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
    byKey.set(key, {
      clientId,
      clientName: String(c?.clientName ?? '').trim(),
      phone: String(c?.phone ?? '').trim(),
      cardNumber: String(c?.cardNumber ?? c?.card_number ?? '').trim(),
      hall,
      endDate,
      amount: roundPlanRub((avg * pct) / 100),
      source: c?.source || '',
      avgRub: avg,
      confirmed: false,
      factAmount: null,
    })
  }

  const confirmedList = Array.isArray(suggest?.confirmedClosings) ? suggest.confirmedClosings : []
  for (const c of confirmedList) {
    const clientId = String(c?.clientId ?? '')
    const endDate = String(c?.endDate ?? '').slice(0, 10)
    const hall = c?.hall === 'tz' || c?.hall === 'az' ? c.hall : 'pz'
    const key = `${clientId}|${endDate}|${hall}`
    if (!clientId || !endDate) continue
    const avgRaw = c?.avgRub
    const avg =
      avgRaw == null || avgRaw === ''
        ? null
        : Math.max(0, Number(avgRaw) || 0)
    const factRaw = c?.factAmount
    const factAmount =
      factRaw == null || factRaw === ''
        ? null
        : roundPlanRub(Math.max(0, Number(factRaw) || 0)) || null
    // Confirmed побеждает open при том же ключе.
    byKey.set(key, {
      clientId,
      clientName: String(c?.clientName ?? '').trim(),
      phone: String(c?.phone ?? '').trim(),
      cardNumber: String(c?.cardNumber ?? c?.card_number ?? '').trim(),
      hall,
      endDate,
      amount: avg != null ? roundPlanRub(avg) : 0,
      source: c?.source || '',
      avgRub: avg,
      confirmed: true,
      factAmount,
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
