/** ЗП аэробного зала: количество по типу × ставка aerobic_pay_amount. */

import { parseSalesMoney } from './salesReportCore.js'
import { normalizeAerobicRowsFromDb } from './aerobicSalesMatrix.js'

export function parseAerobicPayRate(raw) {
  if (raw == null || raw === '') return 0
  const n = parseSalesMoney(raw)
  return Number.isNaN(n) ? NaN : n
}

/** @param {Array<{ id: string, aerobic_pay_amount?: number | string }>} membershipTypes */
export function buildAerobicPayRateMap(membershipTypes) {
  const map = new Map()
  for (const t of membershipTypes ?? []) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    const rate = parseAerobicPayRate(t.aerobic_pay_amount)
    map.set(id, Number.isNaN(rate) ? 0 : rate)
  }
  return map
}

function roundRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * @param {Array<{ membership_type_id: string, count: number }>} rows
 * @param {Map<string, number>} rateMap
 */
export function computeAerobicPayrollFromRows(rows, rateMap) {
  let clubTotal = 0
  const byType = []

  for (const row of rows ?? []) {
    const typeId = String(row?.membership_type_id ?? '').trim()
    if (!typeId) continue
    const countN = Math.trunc(Number(row.count) || 0)
    if (countN <= 0) continue
    const amount = roundRub(countN * (rateMap.get(typeId) ?? 0))
    if (amount <= 0) continue
    clubTotal += amount
    const hit = byType.find((x) => x.typeId === typeId)
    if (hit) {
      hit.count += countN
      hit.amount = roundRub(hit.amount + amount)
    } else {
      byType.push({ typeId, count: countN, amount })
    }
  }

  return { clubTotal: roundRub(clubTotal), byType }
}

/** @param {Record<string, unknown> | null | undefined} dailyRow */
export function computeAerobicPayrollFromDailyRow(dailyRow, rateMap) {
  const rows = normalizeAerobicRowsFromDb(dailyRow?.aerobic_sales_matrix)
  return computeAerobicPayrollFromRows(rows, rateMap)
}

/** @param {Array<Record<string, unknown>>} dailyRows */
export function aggregateAerobicPayrollFromDailyRows(dailyRows, rateMap) {
  let clubTotal = 0
  const byType = []

  for (const day of dailyRows ?? []) {
    const dayPay = computeAerobicPayrollFromDailyRow(day, rateMap)
    clubTotal = roundRub(clubTotal + dayPay.clubTotal)
    for (const line of dayPay.byType) {
      const hit = byType.find((x) => x.typeId === line.typeId)
      if (hit) {
        hit.count += line.count
        hit.amount = roundRub(hit.amount + line.amount)
      } else {
        byType.push({ ...line })
      }
    }
  }

  return { clubTotal: roundRub(clubTotal), byType }
}
