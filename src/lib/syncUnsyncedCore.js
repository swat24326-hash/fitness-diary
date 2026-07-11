/**
 * Чистая логика re-queue для node-тестов (без IndexedDB).
 */

/** Убрать служебные поля перед отправкой в API / Supabase. */
export function recordForPush(record) {
  if (!record || typeof record !== 'object') return record ?? {}
  const { synced: _s, __sync: _m, ...rest } = record
  return rest
}

/** Запись пришла с сервера — не отправлять повторно. */
export function markRecordFromCloud(record) {
  if (!record || typeof record !== 'object') return record
  const { __sync: _m, synced: _s, ...rest } = record
  return { ...rest, synced: true }
}

function recordKeyForTable(table_name, record) {
  if (table_name === 'health_cards') {
    return String(record?.client_id ?? record?.id ?? '').trim()
  }
  return String(record?.id ?? '').trim()
}

/** @returns {{ operation: string, remote_id: string | null }} */
export function defaultSyncOperation(table_name, record) {
  if (table_name === 'trainings') return { operation: 'insert', remote_id: null }
  if (table_name === 'body_measurements') return { operation: 'insert', remote_id: null }
  if (table_name === 'client_weight_entries') return { operation: 'insert', remote_id: null }
  if (table_name === 'challenges') return { operation: 'insert', remote_id: null }
  if (table_name === 'memberships') return { operation: 'update', remote_id: record?.id ?? null }
  if (table_name === 'clients') return { operation: 'update', remote_id: record?.id ?? null }
  if (table_name === 'health_cards') return { operation: 'update', remote_id: record?.id ?? null }
  if (table_name === 'membership_types') return { operation: 'update', remote_id: record?.id ?? null }
  return { operation: 'update', remote_id: record?.id ?? null }
}

export function shouldEnqueueUnsyncedRecord(record, pendingKeys, table_name) {
  if (!record || record.synced === true) return false
  const key = recordKeyForTable(table_name, record)
  if (!key) return false
  if (pendingKeys?.has(key)) return false
  return true
}

export function pickUnsyncedRecordsForEnqueue(records, pendingKeys, table_name) {
  return (records ?? []).filter((r) => shouldEnqueueUnsyncedRecord(r, pendingKeys, table_name))
}
