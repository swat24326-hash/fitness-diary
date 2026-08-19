/**
 * Пул R-RET: hall operational (без lite-ПЗ, desk, holding, архива) + не open PNK.
 * Без React / IDB.
 */

import { isClientArchived } from '../clientArchive.js'
import { isNonOperationalClient } from './holdingClientsCore.js'

/**
 * @param {object|null|undefined} client
 * @param {{ holdingTrainerIds?: Set<string>|string[], noTabletTrainerIds?: Set<string>|string[] }} [opts]
 */
export function isClientInRetentionPool(client, opts = {}) {
  if (!client || isClientArchived(client)) return false
  if (isNonOperationalClient(client, opts.holdingTrainerIds, opts.noTabletTrainerIds)) return false
  if (String(client.lifecycle ?? '').trim().toLowerCase() === 'pnk') return false
  return true
}

/**
 * R-RET без учёта archived_at (для churn / archive rate).
 * @param {object|null|undefined} client
 * @param {{ holdingTrainerIds?: Set<string>|string[], noTabletTrainerIds?: Set<string>|string[] }} [opts]
 */
export function isClientInRetentionUniverse(client, opts = {}) {
  if (!client) return false
  if (client.archived_at) {
    return isClientInRetentionPool({ ...client, archived_at: null }, opts)
  }
  return isClientInRetentionPool(client, opts)
}

export function filterRetentionPoolClients(clientRows, opts = {}) {
  return (clientRows ?? []).filter((c) => isClientInRetentionPool(c, opts))
}

/**
 * @param {object[]} clientRows
 * @param {{ holdingTrainerIds?: Set<string>|string[], noTabletTrainerIds?: Set<string>|string[] }} [opts]
 */
export function filterRetentionUniverseClients(clientRows, opts = {}) {
  return (clientRows ?? []).filter((c) => isClientInRetentionUniverse(c, opts))
}
