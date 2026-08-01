/**
 * Holding «Не назначен» (легаси) + desk ТЗ/АЗ без тренера — вне операционных KPI.
 * Без React / IDB.
 */

import { isClientArchived } from '../clientArchive.js'
import { HOLDING_TRAINER_DISPLAY_NAME, isHoldingTrainerUser } from './deskClosingImportCore.js'
import { clientDeskHall } from './deskHallClientsCore.js'

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
 * Desk ТЗ/АЗ (по hall), тренер не нужен.
 * @param {object|null|undefined} client
 */
export function isDeskHallClient(client) {
  return clientDeskHall(client) != null
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
 * Не операционный клиент зала: архив, desk ТЗ/АЗ или holding (легаси).
 * @param {object|null|undefined} client
 * @param {Set<string>|string[]|null|undefined} [holdingTrainerIds]
 */
export function isNonOperationalClient(client, holdingTrainerIds) {
  if (!client) return true
  if (isClientArchived(client)) return true
  if (isDeskHallClient(client)) return true
  if (isClientOnHoldingTrainer(client, holdingTrainerIds)) return true
  return false
}

/**
 * Оперативные клиенты зала: не архив, не desk ТЗ/АЗ, не holding.
 * desk_hall исключается всегда (даже без списка holding).
 * @param {object[]} clientRows
 * @param {Set<string>|string[]|null|undefined} [holdingTrainerIds]
 */
export function filterHallOperationalClients(clientRows, holdingTrainerIds) {
  return (clientRows ?? []).filter((c) => !isNonOperationalClient(c, holdingTrainerIds))
}

export { HOLDING_TRAINER_DISPLAY_NAME, isHoldingTrainerUser }
