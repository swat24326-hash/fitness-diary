/**
 * Holding «Не назначен» — вне операционных KPI / внимания / «Не активные».
 * Без React / IDB.
 */

import { isClientArchived } from '../clientArchive.js'
import { HOLDING_TRAINER_DISPLAY_NAME, isHoldingTrainerUser } from './deskClosingImportCore.js'

/**
 * @param {Iterable<object>|null|undefined} trainers
 * @returns {Set<string>}
 */
export function collectHoldingTrainerIds(trainers) {
  const ids = new Set()
  for (const t of trainers ?? []) {
    if (isHoldingTrainerUser(t) || t?.is_system_placeholder === true) {
      const id = String(t?.id ?? '').trim()
      if (id) ids.add(id)
    }
  }
  return ids
}

/**
 * @param {object|null|undefined} client
 * @param {Set<string>|string[]|null|undefined} holdingTrainerIds
 */
export function isClientOnHoldingTrainer(client, holdingTrainerIds) {
  if (!client) return false
  const tid = String(client.trainer_id ?? '').trim()
  if (!tid) return false
  if (holdingTrainerIds instanceof Set) return holdingTrainerIds.has(tid)
  if (Array.isArray(holdingTrainerIds)) return holdingTrainerIds.map(String).includes(tid)
  return false
}

/**
 * Оперативные клиенты зала: не архив и не на holding-тренере.
 * @param {object[]} clientRows
 * @param {Set<string>|string[]|null|undefined} [holdingTrainerIds]
 */
export function filterHallOperationalClients(clientRows, holdingTrainerIds) {
  const hasHolding =
    (holdingTrainerIds instanceof Set && holdingTrainerIds.size > 0) ||
    (Array.isArray(holdingTrainerIds) && holdingTrainerIds.length > 0)
  return (clientRows ?? []).filter((c) => {
    if (isClientArchived(c)) return false
    if (hasHolding && isClientOnHoldingTrainer(c, holdingTrainerIds)) return false
    return true
  })
}

export { HOLDING_TRAINER_DISPLAY_NAME, isHoldingTrainerUser }
