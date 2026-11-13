/**
 * Чистая логика A2: watermark и prune-план для admin list-clients / list-memberships.
 * Без React / IndexedDB.
 */

/**
 * @param {string} clubId
 * @returns {string}
 */
export function adminClientsPullWatermarkKey(clubId) {
  const cid = String(clubId ?? '').trim()
  return cid ? `admin_clients_pull_at:${cid}` : 'admin_clients_pull_at:'
}

/**
 * @param {unknown} watermark
 * @returns {boolean}
 */
export function shouldUseAdminClientsDelta(watermark) {
  const w = String(watermark ?? '').trim()
  if (!w) return false
  return Number.isFinite(Date.parse(w))
}

/**
 * @param {{ truncated?: boolean, clientIds?: unknown }} p
 * @returns {boolean}
 */
export function canPruneAdminClientsFromIds(p = {}) {
  if (p.truncated === true) return false
  return Array.isArray(p.clientIds)
}

/**
 * Prune абонов по полному списку id. На дельте без membership_ids — нельзя
 * (неполный массив строк сотрёт неизменённые абоны).
 * @param {{ truncated?: boolean, membershipIds?: unknown, isDelta?: boolean }} p
 * @returns {boolean}
 */
export function canPruneAdminMembershipsFromIds(p = {}) {
  if (p.truncated === true) return false
  if (!Array.isArray(p.membershipIds)) return false
  return true
}

/**
 * @param {{
 *   truncated?: boolean,
 *   clientIds?: unknown,
 *   membershipIds?: unknown,
 *   isDelta?: boolean,
 * }} p
 */
export function adminClientsDeltaPrunePlan(p = {}) {
  const pruneClients = canPruneAdminClientsFromIds(p)
  const pruneMemberships = canPruneAdminMembershipsFromIds(p)
  return {
    pruneClients,
    pruneMemberships,
    clientIdsForPrune: pruneClients ? p.clientIds.map((id) => String(id)) : null,
    membershipIdsForPrune: pruneMemberships ? p.membershipIds.map((id) => String(id)) : null,
  }
}

/**
 * Строки-заглушки для reconcileAdminClubCache (нужен только id).
 * @param {unknown} clientIds
 * @param {object[]} [fallbackRows]
 * @returns {object[]}
 */
export function remoteClientsForReconcile(clientIds, fallbackRows = []) {
  if (Array.isArray(clientIds)) {
    return clientIds.map((id) => ({ id: String(id) })).filter((r) => r.id)
  }
  return Array.isArray(fallbackRows) ? fallbackRows : []
}

/**
 * @param {{ ok?: boolean, serverTime?: unknown, previous?: unknown }} p
 * @returns {string | null}
 */
export function nextAdminClientsWatermark(p = {}) {
  if (p.ok === false) {
    const prev = String(p.previous ?? '').trim()
    return prev || null
  }
  const t = String(p.serverTime ?? '').trim()
  if (!t || !Number.isFinite(Date.parse(t))) {
    const prev = String(p.previous ?? '').trim()
    return prev || null
  }
  return t
}
