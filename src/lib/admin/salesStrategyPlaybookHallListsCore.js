/**
 * Полные списки закрытий playbook по залу (ПЗ / ТЗ / АЗ).
 */

import { HALL_RENEWALS_HALLS } from './salesPlanHallRenewalsSuggestCore.js'
import { roundPlanRub } from './salesPlanMatrixCore.js'

/** @typedef {'pz'|'tz'|'az'} PlaybookHall */

/**
 * @param {unknown} hall
 * @returns {PlaybookHall}
 */
export function normalizePlaybookHall(hall) {
  const h = String(hall ?? '').trim().toLowerCase()
  if (h === 'tz' || h === 'az') return h
  return 'pz'
}

/**
 * Все закрытия из недель playbook (плоский список).
 * @param {{ weeks?: Array<{ endings?: object[] }> } | null | undefined} playbook
 */
export function flattenPlaybookEndings(playbook) {
  /** @type {object[]} */
  const out = []
  for (const week of playbook?.weeks ?? []) {
    for (const row of week.endings ?? []) {
      if (row && typeof row === 'object') out.push(row)
    }
  }
  return out
}

/**
 * @param {object[]} endings
 * @param {PlaybookHall} hall
 */
export function filterPlaybookClosingsByHall(endings, hall) {
  const want = normalizePlaybookHall(hall)
  return (endings ?? [])
    .filter((row) => normalizePlaybookHall(row?.hall) === want)
    .slice()
    .sort((a, b) => {
      const da = String(a?.endDate ?? '').slice(0, 10)
      const db = String(b?.endDate ?? '').slice(0, 10)
      if (da !== db) return da.localeCompare(db)
      return String(a?.clientName ?? '').localeCompare(String(b?.clientName ?? ''), 'ru')
    })
}

/**
 * @param {object[]} endings
 */
export function summarizePlaybookClosingsByHall(endings) {
  /** @type {Record<PlaybookHall, { count: number, openCount: number, amount: number }>} */
  const byHall = {
    pz: { count: 0, openCount: 0, amount: 0 },
    tz: { count: 0, openCount: 0, amount: 0 },
    az: { count: 0, openCount: 0, amount: 0 },
  }
  for (const row of endings ?? []) {
    const h = normalizePlaybookHall(row?.hall)
    byHall[h].count += 1
    if (!row?.confirmed) byHall[h].openCount += 1
    byHall[h].amount = roundPlanRub(byHall[h].amount + (Number(row?.amount) || 0))
  }
  return {
    byHall,
    halls: HALL_RENEWALS_HALLS.map((def) => ({
      hall: /** @type {PlaybookHall} */ (def.hall),
      label: def.label,
      ...byHall[/** @type {PlaybookHall} */ (def.hall)],
    })),
    total: (endings ?? []).length,
  }
}

/** Подписи пунктов бургера. */
export const PLAYBOOK_HALL_LIST_TITLES = Object.freeze({
  pz: 'Все закрытия ПЗ',
  tz: 'Все закрытия ТЗ',
  az: 'Все закрытия АЗ',
})

/**
 * Сводка шапки списка: «57 в списке на сумму 123 456 ₽».
 * @param {{ count?: number, amount?: number }} opts
 */
export function describeHallClosingsListMetaRu(opts) {
  const count = Math.max(0, Math.trunc(Number(opts?.count) || 0))
  const amount = roundPlanRub(Number(opts?.amount) || 0)
  const countLabel = new Intl.NumberFormat('ru-RU').format(count)
  if (!(amount > 0)) {
    return count === 1 ? '1 в списке' : `${countLabel} в списке`
  }
  const sumLabel = new Intl.NumberFormat('ru-RU').format(Math.round(amount))
  return `${countLabel} в списке на сумму ${sumLabel} ₽`
}

/**
 * Сумма ориентиров по строкам закрытий.
 * @param {object[]} endings
 */
export function sumPlaybookClosingsAmount(endings) {
  let sum = 0
  for (const row of endings ?? []) {
    sum += Number(row?.amount) || 0
  }
  return roundPlanRub(sum)
}
