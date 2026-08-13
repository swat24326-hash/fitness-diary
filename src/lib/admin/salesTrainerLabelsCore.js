/**
 * ФИО тренеров в отчётах продаж: id из матрицы месяца могут быть
 * вне активного списка клуба (другой club_id, неактивный) — не показывать UUID.
 */

import {
  isLikelyTrainerUuidLabel,
  mergeTrainersWithMatrixNames,
  normalizeMatrixRowsFromDb,
  SALES_TRAINING_CLUB_ID,
  trainerIdsFromTrainingsMatrixInput,
} from './salesTrainingsMatrix.js'

/**
 * @param {Array<{ trainer_id?: string, count?: number }>|null|undefined} rows
 * @returns {string[]}
 */
export function trainerIdsFromMatrixRows(rows) {
  /** @type {Set<string>} */
  const ids = new Set()
  for (const row of rows ?? []) {
    const tid = String(row?.trainer_id ?? '').trim()
    if (!tid || tid === SALES_TRAINING_CLUB_ID) continue
    if ((Number(row?.count) || 0) > 0) ids.add(tid)
  }
  return [...ids]
}

/**
 * Все trainer_id с ненулевым count из дневных строк месяца (trainings_matrix).
 * @param {Array<{ trainings_matrix?: unknown }>|null|undefined} dailyRows
 * @returns {string[]}
 */
export function trainerIdsFromSalesDailyRows(dailyRows) {
  /** @type {Set<string>} */
  const ids = new Set()
  for (const r of dailyRows ?? []) {
    for (const id of trainerIdsFromMatrixRows(normalizeMatrixRowsFromDb(r?.trainings_matrix))) {
      ids.add(id)
    }
  }
  return [...ids]
}

/**
 * @param {Array<{ id?: string, name?: string, email?: string }>|null|undefined} trainers
 * @param {Iterable<string>|null|undefined} ids
 * @returns {string[]}
 */
export function unresolvedTrainerIdsForLabels(trainers, ids) {
  const list = trainers ?? []
  /** @type {string[]} */
  const missing = []
  for (const raw of ids ?? []) {
    const id = String(raw ?? '').trim()
    if (!id) continue
    const row = list.find((t) => String(t?.id ?? '').trim() === id)
    const name = String(row?.name ?? row?.email ?? '').trim()
    if (!row || !name || isLikelyTrainerUuidLabel(name)) missing.push(id)
  }
  return missing
}

/**
 * Нужно ли дотянуть ФИО по id из дневной матрицы и/или строк месяца.
 * @param {Array<{ id?: string, name?: string, email?: string }>|null|undefined} trainers
 * @param {Record<string, string>|null|undefined} matrix
 * @param {Array<{ trainings_matrix?: unknown }>|null|undefined} [monthRows]
 */
export function salesTrainerLabelsNeedEnrich(trainers, matrix, monthRows) {
  /** @type {Set<string>} */
  const ids = new Set([
    ...trainerIdsFromTrainingsMatrixInput(matrix),
    ...trainerIdsFromSalesDailyRows(monthRows),
  ])
  return unresolvedTrainerIdsForLabels(trainers, ids).length > 0
}

/**
 * Подпись строки тренера: никогда не отдаём сырой UUID.
 * @param {string|null|undefined} id
 * @param {{ full_name?: string, name?: string, email?: string }|string|null|undefined} [trainerOrName]
 */
export function salesTrainerDisplayLabel(id, trainerOrName) {
  const sid = String(id ?? '').trim()
  if (sid === SALES_TRAINING_CLUB_ID) return 'По клубу'
  const raw =
    typeof trainerOrName === 'string'
      ? trainerOrName
      : String(trainerOrName?.full_name ?? trainerOrName?.name ?? trainerOrName?.email ?? '').trim()
  if (raw && !isLikelyTrainerUuidLabel(raw)) return raw
  return 'Тренер'
}

/**
 * Слить активных тренеров клуба + ФИО для id из матриц (в т.ч. неактивных / другого клуба).
 * @param {Array<object>|null|undefined} clubTrainers
 * @param {{ daily?: { trainings_matrix?: unknown }|null, monthRows?: Array<{ trainings_matrix?: unknown }>|null, nameCatalog?: Array<object>|null }} opts
 */
export function mergeSalesTrainersForLabels(clubTrainers, opts = {}) {
  const matrixIds = [
    ...trainerIdsFromSalesDailyRows(opts.monthRows),
    ...trainerIdsFromMatrixRows(normalizeMatrixRowsFromDb(opts.daily?.trainings_matrix)),
  ]
  return mergeTrainersWithMatrixNames(clubTrainers ?? [], {}, opts.nameCatalog ?? [], matrixIds)
}
