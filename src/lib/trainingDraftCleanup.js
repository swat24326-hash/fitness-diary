/**
 * Снять локальные артефакты черновика (durable / session / guard) и сигнал UI.
 * Вызывать при удалении draft или завершении тренировки (только clear*).
 */

import { dispatchLocalDataChanged } from './localDataEvents.js'
import { listSyncQueue } from './localDb.js'
import { clearOpenTrainingDraft } from './openTrainingDraftGuard.js'
import { clearTrainingDraftDurable } from './trainingDraftDurableStorage.js'
import { dropTrainingDraftSession } from './trainingDraftSessionCache.js'
import {
  collectPendingTrainingDeleteIds,
  isTrainingPendingDelete,
} from './trainingDraftCleanupCore.js'

/** @type {Set<string>} — same-tab tombstone до reload (delete из карточки / абона). */
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
 * @param {{ trainingId?: string | null, clientId?: string | null }} opts
 */
export function clearTrainingDraftArtifacts(opts = {}) {
  const tid = String(opts.trainingId ?? '').trim()
  const cid = String(opts.clientId ?? '').trim()
  if (tid) {
    locallyDeletedTrainingIds.add(tid)
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
  clearTrainingDraftArtifacts(opts)
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
  if (isTrainingDraftLocallyDeleted(tid)) return false
  try {
    const pending = collectPendingTrainingDeleteIds(await listSyncQueue())
    if (isTrainingPendingDelete(pending, tid)) return false
  } catch {
    /* best-effort */
  }
  return true
}
