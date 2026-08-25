/**
 * Правила очистки черновика — чистая логика для verify.
 */

/**
 * @param {Array<{ table_name?: string, operation?: string, remote_id?: string, data?: object }>} queueItems
 * @returns {Set<string>}
 */
export function collectPendingTrainingDeleteIds(queueItems) {
  const ids = new Set()
  for (const item of queueItems ?? []) {
    if (item?.table_name !== 'trainings') continue
    if (item?.operation !== 'delete') continue
    const k = String(item.remote_id ?? item.data?.id ?? '').trim()
    if (k) ids.add(k)
  }
  return ids
}

/**
 * Не восстанавливать durable/session в IDB, пока delete в очереди sync.
 * @param {Set<string> | null | undefined} pendingDeleteIds
 * @param {string | null | undefined} trainingId
 */
export function isTrainingPendingDelete(pendingDeleteIds, trainingId) {
  const tid = String(trainingId ?? '').trim()
  if (!tid) return false
  return pendingDeleteIds?.has(tid) === true
}

/** @deprecated alias — используйте isTrainingPendingDelete */
export function shouldSkipDurableHydrateForTraining(pendingDeleteIds, trainingId) {
  const tid = String(trainingId ?? '').trim()
  if (!tid) return true
  return isTrainingPendingDelete(pendingDeleteIds, trainingId)
}

/**
 * Можно ли брать durable/session/idb в pickTrainingDraftRestore.
 * @param {string | null | undefined} blockedTrainingId — удалён / pending delete
 * @param {string | null | undefined} candidateTrainingId
 */
export function shouldRestoreTrainingDraftCandidate(blockedTrainingId, candidateTrainingId) {
  const blocked = String(blockedTrainingId ?? '').trim()
  if (!blocked) return true
  const candidate = String(candidateTrainingId ?? '').trim()
  if (!candidate) return true
  return candidate !== blocked
}
