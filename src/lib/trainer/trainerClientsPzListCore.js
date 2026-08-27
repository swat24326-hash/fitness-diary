/**
 * Вкладки Активные | Архив у тренера: закрытый ПЗ (lifecycle) ≠ архив клуба.
 * Без React / IDB.
 */

import {
  findLifecycleRow,
  isHallLifecycleClosed,
  trainerClosedListBadge,
  trainerClosedListBadgeLabel,
} from '../clientHallLifecycleCore.js'

/**
 * В «Архиве» тренера: архив клуба ИЛИ formal close ПЗ (в т.ч. при живом АЗ/ТЗ).
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} lifecycleRows
 */
export function isTrainerPzListClosed(client, lifecycleRows) {
  if (!client) return false
  if (client.archived_at) return true
  return isHallLifecycleClosed(findLifecycleRow(lifecycleRows, client.id, 'pz'))
}

/**
 * В «Активных» тренера: свой клиент, ПЗ не закрыт и не в архиве клуба.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} lifecycleRows
 */
export function isTrainerPzListActive(client, lifecycleRows) {
  return Boolean(client) && !isTrainerPzListClosed(client, lifecycleRows)
}

/**
 * Разделить клиентов тренера на Активные / Архив по lifecycle ПЗ.
 * @param {object[]|null|undefined} clientsAll
 * @param {{ lifecycleRows?: object[] }} [opts]
 * @returns {{ activeClients: object[], archivedClients: object[] }}
 */
export function partitionTrainerClientsByPzLifecycle(clientsAll, opts = {}) {
  const lifecycleRows = opts.lifecycleRows ?? []
  const activeClients = []
  const archivedClients = []
  for (const c of clientsAll ?? []) {
    if (isTrainerPzListClosed(c, lifecycleRows)) archivedClients.push(c)
    else activeClients.push(c)
  }
  return { activeClients, archivedClients }
}

/**
 * Подпись бейджа в Архиве тренера («есть АЗ» / «архив клуба»).
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memberships
 * @param {object[]|null|undefined} lifecycleRows
 * @param {string} [asOf]
 */
export function trainerPzClosedBadgeLabelForClient(client, memberships, lifecycleRows, asOf) {
  const badge = trainerClosedListBadge({
    client,
    memberships,
    lifecycleRows,
    asOf,
  })
  return trainerClosedListBadgeLabel(badge)
}
