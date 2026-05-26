/** Чистая логика синхронизации (без IndexedDB / Supabase) — для UI и node-тестов. */

/** Pull не затирает локальную строку, если для id есть неотправленные insert/update в очереди. */
export function shouldPreserveLocalRowOnPull(pendingIdSet, recordId, hasLocalRow) {
  const id = String(recordId ?? '').trim()
  if (!id || !pendingIdSet?.has(id)) return false
  return !!hasLocalRow
}

/** id клиентов с неотправленным insert в очереди (офлайн-новые). */
export function pendingClientInsertIdsFromQueue(queue) {
  const ids = new Set()
  for (const item of queue || []) {
    if (item?.table_name === 'clients' && item?.operation === 'insert') {
      const id = String(item.data?.id ?? item.remote_id ?? '').trim()
      if (id) ids.add(id)
    }
  }
  return ids
}

/**
 * Офлайн-first: insert и delete не снимаем по списку из облака/локали.
 * update снимаем только если клиента нет в списке и он не в pending insert.
 */
export function isSyncQueueOrphanForCloudClients(item, remoteClientIds, pendingClientInsertIds) {
  if (!item || item.operation === 'insert' || item.operation === 'delete') return false
  if (item.operation !== 'update') return false

  const tbl = item.table_name
  if (!['trainings', 'memberships', 'health_cards', 'body_measurements', 'clients'].includes(tbl)) return false

  const ids = remoteClientIds instanceof Set ? remoteClientIds : new Set([...remoteClientIds].map(String).filter(Boolean))
  const pending =
    pendingClientInsertIds instanceof Set ? pendingClientInsertIds : pendingClientInsertIdsFromQueue(pendingClientInsertIds)

  const d = item.data && typeof item.data === 'object' ? item.data : {}
  if (tbl === 'clients') {
    const recordId = String(d.id ?? item.remote_id ?? '').trim()
    if (pending.has(recordId)) return false
    return !!recordId && !ids.has(recordId)
  }
  const clientId = String(d.client_id ?? '').trim()
  if (pending.has(clientId)) return false
  return !!clientId && !ids.has(clientId)
}

export function isUnrecoverablePushError(status, message) {
  const code = Number(status)
  const msg = String(message ?? '').toLowerCase()
  if (code !== 403 && code !== 404) return false
  return (
    msg.includes('нет доступа к клиенту') ||
    msg.includes('тренировка не найдена') ||
    msg.includes('абонемент не найден') ||
    msg.includes('закреплён за другим') ||
    msg.includes('нет доступа') ||
    msg.includes('не найден')
  )
}

export function isDuplicateInsertError(err) {
  if (!err) return false
  const status = err.status ?? err.statusCode ?? err?.context?.response?.status
  if (status === 409) return true
  const code = String(err.code ?? '')
  if (code === '23505' || code === 'PGRST116' || code === '409') return true
  const msg = String(err.message ?? '').toLowerCase()
  const details = String(err.details ?? '').toLowerCase()
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) return true
  if (msg.includes('already exists') || details.includes('already exists')) return true
  return msg.includes('409') || details.includes('duplicate')
}

/** Текст для UI после flush (офлайн-first: не «успех», если очередь не пуста). */
export function describeFlushQueueResult(flush) {
  if (!flush) return { part: null, hadError: true }
  if (flush.ok) return { part: 'очередь отправлена', hadError: false }
  if (flush.reason === 'offline_or_stub') {
    return { part: null, hadError: false, offline: true, message: 'Облако недоступно или вы офлайн.' }
  }
  if (flush.reason === 'timeout') {
    const n = flush.remaining
    const tail = typeof n === 'number' && n > 0 ? `, осталось ${n}` : ''
    const bg = flush.stillRunning ? ' (отправка продолжается)' : ''
    return { part: `очередь: не всё успело за отведённое время${tail}${bg}`, hadError: true }
  }
  if (flush.reason === 'pending_items') {
    const n = flush.remaining ?? 0
    return {
      part: `не отправлено: ${n} (данные на устройстве сохранены)`,
      hadError: true,
    }
  }
  if (flush.reason === 'busy') {
    return { part: 'очередь: отправка…', hadError: true }
  }
  return { part: flush.reason ? `очередь: ${flush.reason}` : null, hadError: true }
}
