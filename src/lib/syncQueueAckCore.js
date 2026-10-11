/**
 * Что делать с элементом очереди после успешного push (чистая логика, verify-sync-queue-ack).
 * Пока запрос летел, collapse мог влить в тот же local_id более новую правку —
 * снимать такой элемент нельзя, иначе новая версия не уйдёт на сервер (INC-2026-10-11-03).
 */

import { rowRevisionMs } from './syncPullGuardCore.js'

/**
 * @param {object | null | undefined} current — элемент очереди сейчас (IDB)
 * @param {object | null | undefined} pushedData — data, которая ушла в этом запросе
 * @returns {{ action: 'delete' } | { action: 'keep' } | { action: 'as_update', remote_id: string }}
 */
export function resolveQueueItemAfterPushAck(current, pushedData) {
  if (!current || typeof current !== 'object') return { action: 'delete' }
  const currentMs = rowRevisionMs(current.data)
  const pushedMs = rowRevisionMs(pushedData)
  if (!currentMs || !pushedMs || currentMs <= pushedMs) return { action: 'delete' }
  const id = String(current.remote_id ?? current.data?.id ?? '').trim()
  if (current.operation === 'insert' && id) return { action: 'as_update', remote_id: id }
  return { action: 'keep' }
}
