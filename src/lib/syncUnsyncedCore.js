/**
 * Чистая логика re-queue для node-тестов (без IndexedDB).
 */

import { rowRevisionMs } from './syncPullGuardCore.js'
import { isTrainingStatusCompleted } from './trainingPersistStatusCore.js'

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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * Облачная тренировка ≠ отправленной (jsonb переставляет ключи — сравнение без порядка).
 * @param {object | null | undefined} cloudRow
 * @param {object | null | undefined} pushedData
 */
export function trainingCloudDiffersFromPushed(cloudRow, pushedData) {
  if (!cloudRow || !pushedData || typeof cloudRow !== 'object' || typeof pushedData !== 'object') return false
  for (const field of ['status', 'date', 'type']) {
    if (String(cloudRow[field] ?? '') !== String(pushedData[field] ?? '')) return true
  }
  return stableJson(cloudRow.data ?? {}) !== stableJson(pushedData.data ?? {})
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
 *   tableName?: string,
 *   duplicate?: boolean,
 * }} p
 * @returns {{ action: 'use_cloud' } | { action: 'mark_local_synced' } | { action: 'keep_local_needs_update', remote_id: string, requeue?: boolean, requeue_from?: 'local' | 'pushed' }}
 */
export function resolveAfterPushAck(p) {
  const localRow = p?.localRow
  const cloudRow = p?.cloudRow
  const key = String(p?.recordKey ?? '').trim()
  if (!localRow || typeof localRow !== 'object') return { action: 'use_cloud' }
  // Устаревший draft-ack после «Закончить»: cloud новее по updated_at, но status откатил бы completed.
  if (
    isTrainingStatusCompleted(localRow.status) &&
    cloudRow &&
    typeof cloudRow === 'object' &&
    !isTrainingStatusCompleted(cloudRow.status)
  ) {
    return {
      action: 'keep_local_needs_update',
      remote_id: key || String(localRow.id ?? '').trim(),
    }
  }
  const localMs = rowRevisionMs(localRow)
  const cloudMs = rowRevisionMs(cloudRow)
  const pushedMs = rowRevisionMs(p?.pushedData)
  /* Ответ на более ранний push: сервер штампует updated_at своим NOW(), поэтому облако «новее»
     правки, сделанной на планшете уже после отправки. Совершённое завершение в облаке не откатываем. */
  const editedAfterPush = pushedMs > 0 && localMs > pushedMs
  const cloudCompletedOverDraft =
    isTrainingStatusCompleted(cloudRow?.status) && !isTrainingStatusCompleted(localRow.status)
  if (editedAfterPush && !cloudCompletedOverDraft) {
    return { action: 'keep_local_needs_update', remote_id: key || String(localRow.id ?? '').trim() }
  }
  /* insert ушёл до ack первого insert: сервер ответил «строка уже есть» и оставил старую форму. */
  if (
    p?.duplicate === true &&
    p?.tableName === 'trainings' &&
    !cloudCompletedOverDraft &&
    trainingCloudDiffersFromPushed(cloudRow, p?.pushedData)
  ) {
    return {
      action: 'keep_local_needs_update',
      remote_id: key || String(localRow.id ?? '').trim(),
      requeue: true,
      requeue_from: pushedMs > localMs ? 'pushed' : 'local',
    }
  }
  if (localMs <= cloudMs) return { action: 'use_cloud' }

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
