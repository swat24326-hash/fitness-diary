/**
 * Чистая логика: какие локальные абонементы клиента удалить после pull/hydrate.
 * Не удаляем: pending в sync_queue, synced:false, свежие правки (grace после flush).
 */

import { rowRevisionMs } from './syncPullGuardCore.js'

/** После успешного push облако может ещё не отдавать строку — не prune-ить свежие локальные. */
export const MEMBERSHIP_ORPHAN_PRUNE_GRACE_MS = 120_000

/**
 * Нельзя считать remote полным списком для orphan-prune.
 * @param {{ truncated?: boolean }} ctx
 */
export function shouldSkipClientMembershipsOrphanPrune(ctx = {}) {
  return ctx.truncated === true
}

/**
 * @param {object | null | undefined} row
 * @param {number} [nowMs]
 * @param {number} [graceMs]
 */
export function isMembershipWithinOrphanPruneGrace(
  row,
  nowMs = Date.now(),
  graceMs = MEMBERSHIP_ORPHAN_PRUNE_GRACE_MS,
) {
  const rev = rowRevisionMs(row)
  if (!rev) return false
  const grace = Math.max(0, Number(graceMs) || 0)
  return nowMs - rev <= grace
}

/**
 * @param {string} clientId
 * @param {object[]} localMemberships
 * @param {object[]} remoteMemberships
 * @param {Set<string>|string[]|null} pendingMembershipIds
 * @param {{ nowMs?: number, graceMs?: number }} [opts]
 * @returns {string[]}
 */
export function membershipIdsToPruneForClient(
  clientId,
  localMemberships,
  remoteMemberships,
  pendingMembershipIds,
  opts = {},
) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []

  const remoteIds = new Set(
    (remoteMemberships ?? [])
      .map((m) => String(m?.id ?? '').trim())
      .filter(Boolean),
  )
  const pending =
    pendingMembershipIds instanceof Set
      ? pendingMembershipIds
      : new Set((pendingMembershipIds ?? []).map(String).filter(Boolean))

  const nowMs = Number(opts.nowMs) || Date.now()
  const graceMs = opts.graceMs ?? MEMBERSHIP_ORPHAN_PRUNE_GRACE_MS

  const out = []
  for (const m of localMemberships ?? []) {
    if (String(m?.client_id ?? '') !== cid) continue
    const id = String(m?.id ?? '').trim()
    if (!id) continue
    if (m?.synced === false) continue
    if (isMembershipWithinOrphanPruneGrace(m, nowMs, graceMs)) continue
    if (remoteIds.has(id)) continue
    if (pending.has(id)) continue
    out.push(id)
  }
  return out
}

/**
 * Несколько клиентов (trainer-pull / club list без truncated).
 * @param {string[]} clientIds
 * @param {object[]} localMemberships
 * @param {object[]} remoteMemberships
 * @param {Set<string>|string[]|null} pendingMembershipIds
 * @param {{ nowMs?: number, graceMs?: number, truncated?: boolean }} [opts]
 * @returns {string[]}
 */
export function membershipIdsToPruneForClients(
  clientIds,
  localMemberships,
  remoteMemberships,
  pendingMembershipIds,
  opts = {},
) {
  if (shouldSkipClientMembershipsOrphanPrune(opts)) return []
  const ids = [...new Set((clientIds ?? []).map((c) => String(c ?? '').trim()).filter(Boolean))]
  if (!ids.length) return []

  const remoteByClient = new Map()
  for (const m of remoteMemberships ?? []) {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid) continue
    if (!remoteByClient.has(cid)) remoteByClient.set(cid, [])
    remoteByClient.get(cid).push(m)
  }

  const out = []
  for (const cid of ids) {
    out.push(
      ...membershipIdsToPruneForClient(
        cid,
        localMemberships,
        remoteByClient.get(cid) ?? [],
        pendingMembershipIds,
        opts,
      ),
    )
  }
  return out
}
