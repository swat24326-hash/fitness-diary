/**
 * Снять локальные артефакты черновика (durable / session / guard) и сигнал UI.
 * Вызывать при удалении draft или завершении тренировки (только clear*).
 */

import { dispatchLocalDataChanged } from './localDataEvents.js'
import { getDb, listSyncQueue } from './localDb.js'
import { clearOpenTrainingDraft } from './openTrainingDraftGuard.js'
import { clearTrainingDraftDurable } from './trainingDraftDurableStorage.js'
import { dropTrainingDraftSession } from './trainingDraftSessionCache.js'
import {
  collectPendingTrainingDeleteIds,
  isTrainingPendingDelete,
  shouldBlockPersistForLocalTombstone,
} from './trainingDraftCleanupCore.js'

/** @type {Set<string>} — same-tab tombstone до reload (только реальное delete, не «Закончить»). */
const locallyDeletedTrainingIds = new Set()

/**
 * @param {string | null | undefined} trainingId
 */
export function isTrainingDraftLocallyDeleted(trainingId) {
  const tid = String(trainingId ?? '').trim()
  if (!tid) return false
  return locallyDeletedTrainingIds.has(tid)
}

/**
 * @param {{ trainingId?: string | null, clientId?: string | null, markDeleted?: boolean }} opts
 * markDeleted: true только при удалении черновика/клиента (tombstone для canPersist).
 * После «Закончить» — false: строка completed остаётся и её можно снова открыть и править.
 */
export function clearTrainingDraftArtifacts(opts = {}) {
  const tid = String(opts.trainingId ?? '').trim()
  const cid = String(opts.clientId ?? '').trim()
  if (tid) {
    if (opts.markDeleted === true) {
      locallyDeletedTrainingIds.add(tid)
    }
    dropTrainingDraftSession(tid)
    clearOpenTrainingDraft(tid)
    clearTrainingDraftDurable({ trainingId: tid, clientId: cid || undefined })
  }
  if (cid) {
    clearTrainingDraftDurable({ clientId: cid, isNew: true })
  }
}

/**
 * После deleteLocalWithSync: обновить вкладки черновиков / debounced reload.
 * @param {{ trainingId?: string | null, clientId?: string | null }} opts
 */
export function notifyTrainingDraftDeleted(opts = {}) {
  clearTrainingDraftArtifacts({ ...opts, markDeleted: true })
  dispatchLocalDataChanged({
    reason: 'training-draft-deleted',
    trainingId: opts.trainingId ?? null,
    clientId: opts.clientId ?? null,
  })
}

/**
 * Можно ли писать durable / persist для training id (очередь delete + tombstone).
 * @param {string | null | undefined} trainingId
 */
export async function canPersistTrainingDraft(trainingId) {
  const tid = String(trainingId ?? '').trim()
  if (!tid) return true
  let pendingDelete = false
  try {
    const pending = collectPendingTrainingDeleteIds(await listSyncQueue())
    pendingDelete = isTrainingPendingDelete(pending, tid)
  } catch {
    /* best-effort */
  }
  if (pendingDelete) return false

  if (!isTrainingDraftLocallyDeleted(tid)) return true

  // Tombstone после ошибочного markDeleted или старого «Закончить»: если строка ещё в IDB — править можно.
  let hasLocalRow = false
  try {
    const row = await (await getDb()).get('trainings', tid)
    hasLocalRow = Boolean(row)
  } catch {
    /* best-effort */
  }
  return !shouldBlockPersistForLocalTombstone({ hasLocalRow, pendingDelete: false })
}
