import { isSupabaseConfigured } from './supabase'
import { getDb, putStore, listSyncQueue, removeSyncItem } from './localDb'
import { saveLocalWithSync } from './syncService'
import { pushRecordViaApi } from './syncApiClient'
import {
  invalidateExerciseCatalogCache,
  markExercisesSyncMetaDirty,
  refreshExercisesSyncMetaFromLocal,
} from './exerciseCatalog'

async function afterExerciseMutation(cloudOk) {
  invalidateExerciseCatalogCache()
  if (cloudOk) await refreshExercisesSyncMetaFromLocal()
  else await markExercisesSyncMetaDirty()
}

function normalizeExerciseRow(row) {
  return {
    ...row,
    name: String(row.name ?? '').trim(),
    muscle_group: String(row.muscle_group ?? '').trim(),
    primary_muscles: row.primary_muscles ? String(row.primary_muscles).trim() : null,
    comment: row.comment ? String(row.comment).trim() : null,
  }
}

async function applyDuplicateFromServer(localId, serverRecord) {
  if (!serverRecord?.id) return
  await putStore('exercises', serverRecord)
  if (localId && String(localId) !== String(serverRecord.id)) {
    const db = await getDb()
    try {
      await db.delete('exercises', localId)
    } catch {
      /* ignore */
    }
  }
}

async function pushExerciseOp(operation, row, remoteId) {
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { cloudOk: false, cloudError: 'Нет сети — упражнение только на этом устройстве. Нажмите Sync позже.' }
  }
  const push = await pushRecordViaApi({
    table_name: 'exercises',
    operation,
    data: row,
    remote_id: remoteId ?? row.id ?? null,
    local_id: null,
  })
  if (push.ok && push.duplicate && push.record) {
    await applyDuplicateFromServer(row.id, push.record)
  }
  if (push.ok) await afterExerciseMutation(true)
  return push.ok
    ? { cloudOk: true, merged: !!push.duplicate, record: push.record }
    : { cloudOk: false, cloudError: push.error ?? 'Не удалось отправить в облако' }
}

/** @returns {Promise<{ cloudOk: boolean, cloudError?: string, merged?: boolean }>} */
export async function insertExercise(row) {
  const payload = normalizeExerciseRow(row)
  if (!payload.name || !payload.muscle_group) {
    return { cloudOk: false, cloudError: 'Укажите название и направленность' }
  }
  await saveLocalWithSync('exercises', payload, {
    table_name: 'exercises',
    operation: 'insert',
    remote_id: null,
  })
  invalidateExerciseCatalogCache()
  return pushExerciseOp('insert', payload, null)
}

/** @returns {Promise<{ cloudOk: boolean, cloudError?: string }>} */
export async function updateExercise(row) {
  const payload = normalizeExerciseRow(row)
  if (!payload.id) return { cloudOk: false, cloudError: 'Нет id упражнения' }
  await saveLocalWithSync('exercises', payload, {
    table_name: 'exercises',
    operation: 'update',
    remote_id: payload.id,
  })
  invalidateExerciseCatalogCache()
  return pushExerciseOp('update', payload, payload.id)
}

/** @returns {Promise<{ cloudOk: boolean, cloudError?: string }>} */
export async function removeExercise(id) {
  const eid = String(id ?? '').trim()
  if (!eid) return { cloudOk: false, cloudError: 'Нет id' }

  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { cloudOk: false, cloudError: 'Нет сети — удаление только после Sync при подключении.' }
  }

  const push = await pushRecordViaApi({
    table_name: 'exercises',
    operation: 'delete',
    data: {},
    remote_id: eid,
    local_id: null,
  })
  if (!push.ok) {
    return { cloudOk: false, cloudError: push.error ?? 'Не удалось удалить в облаке' }
  }

  const db = await getDb()
  await db.delete('exercises', eid)
  const queue = await listSyncQueue()
  for (const item of queue) {
    if (item.table_name !== 'exercises') continue
    if (item.remote_id === eid || item.data?.id === eid) {
      await removeSyncItem(item.local_id)
    }
  }
  await afterExerciseMutation(true)
  return { cloudOk: true }
}
