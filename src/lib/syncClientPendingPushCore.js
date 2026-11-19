/**
 * Гонка push: абонемент / lifecycle / вес уходят в том же пакете, что insert клиента.
 * Пока клиента нет в облаке — это ожидание, не «нет доступа».
 */

export const CLIENT_PENDING_IN_CLOUD_PUSH_ERROR = 'Клиент пока не в облаке — повторите Sync'

/** @param {unknown} message */
export function isClientPendingInCloudPushError(message) {
  return String(message ?? '')
    .toLowerCase()
    .includes('клиент пока не в облаке')
}

/**
 * Есть ли в очереди неотправленный insert этого клиента.
 * @param {Array<{ table_name?: string, operation?: string, data?: object, remote_id?: string|null }>|null|undefined} queue
 * @param {string} clientId
 */
export function queueHasClientInsert(queue, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return false
  return (queue ?? []).some((q) => {
    if (String(q?.table_name ?? '') !== 'clients') return false
    if (String(q?.operation ?? '') !== 'insert') return false
    const qid = String(q?.data?.id ?? q?.remote_id ?? '').trim()
    return qid === id
  })
}

/**
 * После 403 «клиент не в облаке»: что сделать с локальной карточкой.
 * @param {{
 *   clientId?: string|null,
 *   localClient?: object|null,
 *   queue?: object[]|null,
 * }} input
 * @returns {{ action: 'none', reason: string } | { action: 'enqueue_insert', clientId: string } | { action: 'drop_dependent', reason: string }}
 */
export function planEnsureClientQueuedForPush(input) {
  const clientId = String(input?.clientId ?? '').trim()
  if (!clientId) return { action: 'none', reason: 'no_client_id' }
  if (queueHasClientInsert(input?.queue, clientId)) {
    return { action: 'none', reason: 'already_queued' }
  }
  const local = input?.localClient
  if (!local || String(local.id ?? '').trim() !== clientId) {
    return { action: 'drop_dependent', reason: 'no_local_client' }
  }
  return { action: 'enqueue_insert', clientId }
}
