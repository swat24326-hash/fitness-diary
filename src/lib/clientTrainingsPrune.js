/**
 * Чистая логика: какие локальные тренировки клиента удалить после pull с сервера.
 */

/**
 * @param {string} clientId
 * @param {object[]} localTrainings
 * @param {object[]} remoteTrainings
 * @param {Set<string>|string[]|null} pendingTrainingIds — id из sync_queue (insert/update)
 * @returns {string[]} id локальных тренировок, которые можно удалить
 */
export function trainingIdsToPruneForClient(clientId, localTrainings, remoteTrainings, pendingTrainingIds) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []

  const remoteIds = new Set(
    (remoteTrainings ?? [])
      .map((t) => String(t?.id ?? '').trim())
      .filter(Boolean),
  )
  const pending =
    pendingTrainingIds instanceof Set
      ? pendingTrainingIds
      : new Set((pendingTrainingIds ?? []).map(String).filter(Boolean))

  const out = []
  for (const t of localTrainings ?? []) {
    if (String(t?.client_id ?? '') !== cid) continue
    const id = String(t?.id ?? '').trim()
    if (!id) continue
    if (String(t?.status ?? '') === 'draft') continue
    if (remoteIds.has(id)) continue
    if (pending.has(id)) continue
    out.push(id)
  }
  return out
}
