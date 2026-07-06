/**
 * Правила merge membership_types при pull (без IDB/React — для verify и сервиса).
 */

/** @param {object[]} [syncQueueItems] */
export function buildPendingMembershipTypeKeys(syncQueueItems) {
  const pendingUpdates = new Set()
  const pendingInserts = new Set()
  for (const item of syncQueueItems ?? []) {
    if (item.table_name !== 'membership_types') continue
    if (item.operation === 'insert') {
      const id = String(item.data?.id ?? '').trim()
      if (id) pendingInserts.add(id)
      continue
    }
    if (item.operation === 'update') {
      const id = String(item.remote_id ?? item.data?.id ?? '').trim()
      if (id) pendingUpdates.add(id)
    }
  }
  return { pendingUpdates, pendingInserts }
}

/**
 * Перезаписать локальную строку данными из облака?
 * @param {{ id: string, forceFromCloud?: boolean, pendingUpdates: Set<string>, pendingInserts: Set<string> }} p
 */
export function shouldApplyRemoteMembershipTypeRow(p) {
  const id = String(p.id ?? '').trim()
  if (!id) return false
  if (p.pendingInserts.has(id)) return false
  if (!p.forceFromCloud && p.pendingUpdates.has(id)) return false
  return true
}

/**
 * Удалить локальную строку, которой нет в ответе облака?
 * @param {{ id: string, remoteIds: Set<string>, forceFromCloud?: boolean, pendingUpdates: Set<string>, pendingInserts: Set<string> }} p
 */
export function shouldDeleteLocalMembershipTypeRow(p) {
  const id = String(p.id ?? '').trim()
  if (!id || p.remoteIds.has(id)) return false
  if (p.pendingInserts.has(id)) return false
  if (!p.forceFromCloud && p.pendingUpdates.has(id)) return false
  return true
}
