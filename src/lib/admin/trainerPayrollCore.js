/** ФОТ тренеров: матрица отчёта × ставка типа абонемента (без «Без типа»). */

import { parseSalesMoney } from './salesReportCore.js'
import { normalizeMatrixRowsFromDb } from './salesTrainingsMatrix.js'

export function parseTrainerPayRate(raw) {
  if (raw == null || raw === '') return 0
  const n = parseSalesMoney(raw)
  return Number.isNaN(n) ? NaN : n
}

/** @param {Array<{ id: string, trainer_pay_per_session?: number | string }>} membershipTypes */
export function buildTrainerPayRateMap(membershipTypes) {
  const map = new Map()
  for (const t of membershipTypes ?? []) {
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    const rate = parseTrainerPayRate(t.trainer_pay_per_session)
    map.set(id, Number.isNaN(rate) ? 0 : rate)
  }
  return map
}

function roundRub(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function payForCell(count, typeId, rateMap) {
  const tid = typeId == null || typeId === '' ? null : String(typeId).trim()
  if (!tid) return 0
  const countN = Math.trunc(Number(count) || 0)
  if (countN <= 0) return 0
  return roundRub(countN * (rateMap.get(tid) ?? 0))
}

function mergeByTypeLines(target, lines) {
  for (const line of lines ?? []) {
    const hit = target.find((x) => x.typeId === line.typeId)
    if (hit) {
      hit.count += line.count
      hit.amount = roundRub(hit.amount + line.amount)
    } else {
      target.push({ ...line })
    }
  }
}

/**
 * @param {Array<{ trainer_id: string, membership_type_id: string | null, count: number }>} matrixRows
 * @param {Map<string, number>} rateMap
 * @param {{ trainerIdFilter?: string | null }} [opts]
 */
export function computePayrollFromMatrixRows(matrixRows, rateMap, opts = {}) {
  const filter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : null
  const byTrainer = new Map()
  let clubTotal = 0

  for (const row of matrixRows ?? []) {
    const trainerId = String(row?.trainer_id ?? '').trim()
    if (!trainerId) continue
    if (filter && trainerId !== filter) continue
    const amount = payForCell(row.count, row.membership_type_id, rateMap)
    if (amount <= 0) continue

    clubTotal += amount
    if (!byTrainer.has(trainerId)) {
      byTrainer.set(trainerId, { trainerId, total: 0, byType: [] })
    }
    const entry = byTrainer.get(trainerId)
    entry.total = roundRub(entry.total + amount)
    const typeId =
      row.membership_type_id == null || row.membership_type_id === ''
        ? null
        : String(row.membership_type_id).trim()
    if (!typeId) continue
    mergeByTypeLines(entry.byType, [
      {
        typeId,
        count: Math.trunc(Number(row.count) || 0),
        amount,
      },
    ])
  }

  return { clubTotal: roundRub(clubTotal), byTrainer }
}

/** @param {Record<string, unknown> | null | undefined} dailyRow */
export function computePayrollFromDailyRow(dailyRow, rateMap, opts = {}) {
  const rows = normalizeMatrixRowsFromDb(dailyRow?.trainings_matrix)
  return computePayrollFromMatrixRows(rows, rateMap, opts)
}

/** @param {Array<Record<string, unknown>>} dailyRows */
export function aggregatePayrollFromDailyRows(dailyRows, rateMap, opts = {}) {
  const byTrainer = new Map()
  let clubTotal = 0

  for (const day of dailyRows ?? []) {
    const dayPay = computePayrollFromDailyRow(day, rateMap, opts)
    clubTotal = roundRub(clubTotal + dayPay.clubTotal)
    for (const [tid, entry] of dayPay.byTrainer) {
      if (!byTrainer.has(tid)) {
        byTrainer.set(tid, { trainerId: tid, total: 0, byType: [] })
      }
      const acc = byTrainer.get(tid)
      acc.total = roundRub(acc.total + entry.total)
      mergeByTypeLines(acc.byType, entry.byType)
    }
  }

  return { clubTotal: roundRub(clubTotal), byTrainer }
}

export function computeNetProfitWithPayroll(earnings, trainerPayroll, expense, aerobicPayroll = 0) {
  const e = Number(earnings) || 0
  const p = Number(trainerPayroll) || 0
  const a = Number(aerobicPayroll) || 0
  const x = Number(expense) || 0
  return roundRub(e - p - a - x)
}

/** @param {{ byTrainerByType?: Array<{ trainerId: string, byType?: Array<{ typeId: string | null, count: number }> }> }} stats */
export function computePayrollFromMembershipStats(stats, rateMap, opts = {}) {
  const filter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : null
  const rows = []
  for (const tr of stats?.byTrainerByType ?? []) {
    const trainerId = String(tr.trainerId ?? '').trim()
    if (!trainerId) continue
    if (filter && trainerId !== filter) continue
    for (const t of tr.byType ?? []) {
      if (t.typeId == null) continue
      const count = Math.trunc(Number(t.count) || 0)
      if (count <= 0) continue
      rows.push({ trainer_id: trainerId, membership_type_id: t.typeId, count })
    }
  }
  return computePayrollFromMatrixRows(rows, rateMap, opts)
}

/** @param {string} trainerId @param {Map<string, { trainerId: string, total: number }>} byTrainer */
export function trainerPayrollTotalFor(byTrainer, trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return 0
  return roundRub(byTrainer.get(tid)?.total ?? 0)
}
