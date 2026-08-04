/**
 * Holding «Не назначен» (легаси) + desk ТЗ/АЗ + lite ПЗ (тренер без планшета).
 * Два фильтра:
 * - commercial — продажи / абоны / продления (lite ПЗ **внутри**)
 * - hall operational — дневник / «неактивные» / качество ведения (lite **снаружи**, пустой дневник)
 * Без React / IDB.
 */

import { isClientArchived } from '../clientArchive.js'
import { HOLDING_TRAINER_DISPLAY_NAME, isHoldingTrainerUser } from './deskClosingImportCore.js'
import { clientDeskHall } from './deskHallClientsCore.js'
import { isClientOnNoTabletTrainer } from './trainerTabletModeCore.js'

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
 * Вне коммерческого контура клуба: архив, desk ТЗ/АЗ, holding.
 * Lite ПЗ (тренер без планшета) **сюда не входит** — у них живой абон и оплата.
 * @param {object|null|undefined} client
 * @param {Set<string>|string[]|null|undefined} [holdingTrainerIds]
 */
export function isNonCommercialClient(client, holdingTrainerIds) {
  if (!client) return true
  if (isClientArchived(client)) return true
  if (isDeskHallClient(client)) return true
  if (isClientOnHoldingTrainer(client, holdingTrainerIds)) return true
  return false
}

/**
 * Клиенты для абонов / продлений / «с действующим» (включая lite ПЗ).
 * @param {object[]} clientRows
 * @param {Set<string>|string[]|null|undefined} [holdingTrainerIds]
 */
export function filterCommercialClients(clientRows, holdingTrainerIds) {
  return (clientRows ?? []).filter((c) => !isNonCommercialClient(c, holdingTrainerIds))
}

/**
 * Не операционный для дневника зала: архив, desk, holding или lite ПЗ.
 * @param {object|null|undefined} client
 * @param {Set<string>|string[]|null|undefined} [holdingTrainerIds]
 * @param {Set<string>|string[]|null|undefined} [noTabletTrainerIds]
 */
export function isNonOperationalClient(client, holdingTrainerIds, noTabletTrainerIds) {
  if (isNonCommercialClient(client, holdingTrainerIds)) return true
  if (isClientOnNoTabletTrainer(client, noTabletTrainerIds)) return true
  return false
}

/**
 * Оперативные клиенты зала (полный дневник на планшете).
 * @param {object[]} clientRows
 * @param {Set<string>|string[]|null|undefined} [holdingTrainerIds]
 * @param {Set<string>|string[]|null|undefined} [noTabletTrainerIds]
 */
export function filterHallOperationalClients(clientRows, holdingTrainerIds, noTabletTrainerIds) {
  return (clientRows ?? []).filter((c) => !isNonOperationalClient(c, holdingTrainerIds, noTabletTrainerIds))
}

export { HOLDING_TRAINER_DISPLAY_NAME, isHoldingTrainerUser }
