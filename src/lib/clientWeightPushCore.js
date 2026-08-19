/** Push/sync веса: связь с тренировкой без FK-ловушек (чистые функции). */

/**
 * @param {string} message
 */
export function isWeightEntryTrainingFkError(message) {
  const msg = String(message ?? '').toLowerCase()
  return (
    msg.includes('client_weight_entries_training_id_fkey') ||
    (msg.includes('foreign key') && msg.includes('training_id'))
  )
}

/**
 * @param {object | null | undefined} payload
 * @param {{ trainingExists?: boolean }} ctx
 */
export function sanitizeWeightEntryTrainingLink(payload, ctx = {}) {
  if (!payload || typeof payload !== 'object') return payload
  const tid = String(payload.training_id ?? '').trim()
  if (!tid) return payload
  if (ctx.trainingExists === true) return payload
  return { ...payload, training_id: null }
}

/** id тренировок с неотправленным insert в очереди. */
export function pendingTrainingInsertIdsFromQueue(queue) {
  const ids = new Set()
  for (const item of queue || []) {
    if (item?.table_name !== 'trainings' || item?.operation !== 'insert') continue
    const id = String(item.data?.id ?? item.remote_id ?? '').trim()
    if (id) ids.add(id)
  }
  return ids
}

/** Тренировка в очереди на удаление — ссылку на неё в весе снимаем. */
export function isTrainingDeletePendingInQueue(queue, trainingId) {
  const tid = String(trainingId ?? '').trim()
  if (!tid) return false
  for (const item of queue || []) {
    if (item?.table_name !== 'trainings' || item?.operation !== 'delete') continue
    const rid = String(item.remote_id ?? item.data?.id ?? '').trim()
    if (rid === tid) return true
  }
  return false
}

/**
 * @param {object | null | undefined} payload
 * @param {{ queue?: object[], trainingExistsLocally?: boolean }} ctx
 * @returns {{ payload: object, defer?: boolean, reason?: string }}
 */
export function planWeightEntryPushPayload(payload, ctx = {}) {
  const base = payload && typeof payload === 'object' ? { ...payload } : {}
  const tid = String(base.training_id ?? '').trim()
  if (!tid) return { payload: base }

  const queue = ctx.queue ?? []
  if (pendingTrainingInsertIdsFromQueue(queue).has(tid)) {
    return {
      payload: base,
      defer: true,
      reason: 'Тренировка ещё не отправлена — запись веса подождёт',
    }
  }
  if (isTrainingDeletePendingInQueue(queue, tid) || ctx.trainingExistsLocally === false) {
    return { payload: sanitizeWeightEntryTrainingLink(base, { trainingExists: false }) }
  }
  return { payload: base }
}
