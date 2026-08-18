/**
 * Кто какой pull после flush: продажи / админ / тренер. Без React и сети.
 */

export function resolveHeaderSyncPullRole(p = {}) {
  if (p.isSalesManager) return 'sales'
  if (p.isAdmin) return 'admin'
  if (String(p.user?.id ?? '').trim()) return 'trainer'
  return 'none'
}

/** Force-merge справочников только если очередь ушла — иначе pending типы/ДЗ не затираем. */
export function resolveHeaderSyncForceFromCloud(flushOk) {
  return flushOk === true
}
