/**
 * Чистая логика re-queue для node-тестов (без IndexedDB).
 */

import { rowRevisionMs } from './syncPullGuardCore.js'

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

/**
 * После успешного push / 409: что писать в IDB.
 * Типичный залип: insert уже в облаке → 409 со старым updated_at → локаль «новее» →
 * раньше return без synced → вечное «Только на устройстве».
 *
 * @param {{
 *   localRow?: object | null,
 *   cloudRow?: object | null,
 *   pushedData?: object | null,
 *   recordKey?: string,
 * }} p
 * @returns {{ action: 'use_cloud' } | { action: 'mark_local_synced' } | { action: 'keep_local_needs_update', remote_id: string }}
 */
export function resolveAfterPushAck(p) {
  const localRow = p?.localRow
  const cloudRow = p?.cloudRow
  const key = String(p?.recordKey ?? '').trim()
  if (!localRow || typeof localRow !== 'object') return { action: 'use_cloud' }
  const localMs = rowRevisionMs(localRow)
  const cloudMs = rowRevisionMs(cloudRow)
  if (localMs <= cloudMs) return { action: 'use_cloud' }

  const pushedMs = rowRevisionMs(p?.pushedData)
  // Локаль = то, что только что ушло (или без ревизии у payload) — 409 со старым cloud.
  if (!pushedMs || localMs <= pushedMs) {
    return { action: 'mark_local_synced' }
  }
  // Правка в полёте поверх отправленного — нужен update, не insert→409.
  return { action: 'keep_local_needs_update', remote_id: key || String(localRow.id ?? '').trim() }
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
  if (table_name === 'pnk_funnel_events') return { operation: 'insert', remote_id: record?.id ?? null }
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
