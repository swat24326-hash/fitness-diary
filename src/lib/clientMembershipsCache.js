/**
 * Согласование локальных абонементов с облаком после pull/hydrate.
 */

import { getDb, getAllStore } from './localDb'
import { listMembershipsByClientId } from './localDbClubQuery'
import {
  membershipIdsToPruneForClient,
  membershipIdsToPruneForClients,
  shouldSkipClientMembershipsOrphanPrune,
} from './clientMembershipsPrune'
import { invalidateAdminClubWorkspaceCache } from './admin/adminClubWorkspaceCache'
import { invalidateTrainerWorkspaceCache } from './trainerWorkspaceCache'

export {
  membershipIdsToPruneForClient,
  membershipIdsToPruneForClients,
  shouldSkipClientMembershipsOrphanPrune,
} from './clientMembershipsPrune'

function notifyMembershipsCachePruned(pruned) {
  if (!pruned) return
  invalidateTrainerWorkspaceCache()
  invalidateAdminClubWorkspaceCache()
}

/**
 * @param {string} clientId
 * @param {object[]} remoteMemberships
 * @param {Set<string>|null} [pendingMembershipIds]
 * @param {{ truncated?: boolean }} [opts]
 * @returns {Promise<number>}
 */
export async function pruneOrphanMembershipsForClient(
  clientId,
  remoteMemberships,
  pendingMembershipIds = null,
  opts = {},
) {
  if (shouldSkipClientMembershipsOrphanPrune({ truncated: opts.truncated === true })) {
    return 0
  }
  const local = await listMembershipsByClientId(clientId)
  const ids = membershipIdsToPruneForClient(clientId, local, remoteMemberships, pendingMembershipIds)
  if (!ids.length) return 0
  const db = await getDb()
  for (const id of ids) {
    await db.delete('memberships', id)
  }
  notifyMembershipsCachePruned(ids.length)
  return ids.length
}

/**
 * После trainer-pull / полного list-memberships: убрать локальные абоны клиентов из облака, которых нет в remote.
 * @param {string[]|object[]} clientsOrIds — id или объекты с id
 * @param {object[]} remoteMemberships
 * @param {Set<string>|null} [pendingMembershipIds]
 * @param {{ truncated?: boolean }} [opts]
 */
export async function pruneOrphanMembershipsForClients(
  clientsOrIds,
  remoteMemberships,
  pendingMembershipIds = null,
  opts = {},
) {
  if (shouldSkipClientMembershipsOrphanPrune({ truncated: opts.truncated === true })) {
    return 0
  }
  const clientIds = (clientsOrIds ?? [])
    .map((c) => (typeof c === 'string' ? c : c?.id))
    .map((id) => String(id ?? '').trim())
    .filter(Boolean)
  if (!clientIds.length) return 0

  let local = []
  try {
    local = await getAllStore('memberships')
  } catch {
    return 0
  }
  const ids = membershipIdsToPruneForClients(
    clientIds,
    local,
    remoteMemberships,
    pendingMembershipIds,
    opts,
  )
  if (!ids.length) return 0
  const db = await getDb()
  for (const id of ids) {
    await db.delete('memberships', id)
  }
  notifyMembershipsCachePruned(ids.length)
  return ids.length
}
