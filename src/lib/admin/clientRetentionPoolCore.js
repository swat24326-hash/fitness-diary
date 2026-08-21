/**
 * Пул R-RET: hall operational (без lite-ПЗ, desk, holding, архива) + не open PNK.
 * Закрытый ПЗ (lifecycle) — вне живого пула; в universe архива клуба — через ignoreClosedPz.
 * Без React / IDB.
 */

import { isClientArchived } from '../clientArchive.js'
import { isTrainerPzClosedView } from '../clientHallLifecycleCore.js'
import { isNonOperationalClient } from './holdingClientsCore.js'

/**
 * @param {object|null|undefined} client
 * @param {{
 *   holdingTrainerIds?: Set<string>|string[],
 *   noTabletTrainerIds?: Set<string>|string[],
 *   lifecycleRows?: object[],
 *   ignoreClosedPz?: boolean,
 * }} [opts]
 */
export function isClientInRetentionPool(client, opts = {}) {
  if (!client || isClientArchived(client)) return false
  if (isNonOperationalClient(client, opts.holdingTrainerIds, opts.noTabletTrainerIds)) return false
  if (String(client.lifecycle ?? '').trim().toLowerCase() === 'pnk') return false
  if (!opts.ignoreClosedPz && isTrainerPzClosedView(client, opts.lifecycleRows)) return false
  return true
}

/**
 * R-RET без учёта archived_at (для churn / archive rate).
 * Архив клуба остаётся в universe даже если ПЗ уже был закрыт до archived_at.
 * @param {object|null|undefined} client
 * @param {{
 *   holdingTrainerIds?: Set<string>|string[],
 *   noTabletTrainerIds?: Set<string>|string[],
 *   lifecycleRows?: object[],
 * }} [opts]
 */
export function isClientInRetentionUniverse(client, opts = {}) {
  if (!client) return false
  if (client.archived_at) {
    return isClientInRetentionPool(
      { ...client, archived_at: null },
      { ...opts, ignoreClosedPz: true },
    )
  }
  return isClientInRetentionPool(client, opts)
}

export function filterRetentionPoolClients(clientRows, opts = {}) {
  return (clientRows ?? []).filter((c) => isClientInRetentionPool(c, opts))
}

/**
 * @param {object[]} clientRows
 * @param {{
 *   holdingTrainerIds?: Set<string>|string[],
 *   noTabletTrainerIds?: Set<string>|string[],
 *   lifecycleRows?: object[],
 * }} [opts]
 */
export function filterRetentionUniverseClients(clientRows, opts = {}) {
  return (clientRows ?? []).filter((c) => isClientInRetentionUniverse(c, opts))
}
