/** Чистая логика синхронизации (без IndexedDB / Supabase) — для UI и node-тестов. */

/** Pull не затирает локальную строку и не восстанавливает удалённую при pending в очереди. */
export function shouldPreserveLocalRowOnPull(pendingIdSet, recordId, _hasLocalRow) {
  const id = String(recordId ?? '').trim()
  if (!id || !pendingIdSet?.has(id)) return false
  // delete в очереди: локальной строки нет — всё равно не восстанавливаем из облака
  return true
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
  // Битый insert абонемента без дат — не крутить 12 раз, снять из очереди.
  if (code === 400) {
    return (
      msg.includes('укажите дату начала') ||
      msg.includes('укажите дату окончания') ||
      msg.includes('конец раньше начала') ||
      msg.includes('не может быть раньше начала') ||
      msg.includes('некорректный абонемент')
    )
  }
  if (code !== 403 && code !== 404) return false
  return (
    msg.includes('нет доступа к клиенту') ||
    msg.includes('тренировка не найдена') ||
    msg.includes('абонемент не найден') ||
    msg.includes('закреплён за другим') ||
    msg.includes('закреплён за вами') ||
    msg.includes('должен быть вашей') ||
    msg.includes('должен быть закреплён') ||
    msg.includes('нельзя переназначить') ||
    msg.includes('только администратор') ||
    msg.includes('другого клуба') ||
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

/**
 * Схлопнуть in-memory пачку auto-push:
 * - delete побеждает insert/update той же сущности;
 * - insert + update → один insert с последними данными (ранняя активация офлайн).
 * @param {Array<{ table_name?: string, operation?: string, remote_id?: string | null, data?: object, local_id?: string }>} items
 */
export function collapseMemoryPushBatch(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  if (list.length <= 1) return list

  const entityKey = (item) => {
    const table = String(item?.table_name ?? '').trim()
    const d = item?.data && typeof item.data === 'object' ? item.data : {}
    const id = String(item?.remote_id ?? d.id ?? '').trim()
    if (!table || !id) return ''
    return `${table}:${id}`
  }

  /** @type {Map<string, typeof list>} */
  const byEntity = new Map()
  /** @type {typeof list} */
  const passthrough = []

  for (const item of list) {
    const key = entityKey(item)
    if (!key) {
      passthrough.push(item)
      continue
    }
    const prev = byEntity.get(key)
    if (prev) prev.push(item)
    else byEntity.set(key, [item])
  }

  /** @type {typeof list} */
  const out = [...passthrough]
  for (const group of byEntity.values()) {
    const lastDeleteIdx = group.map((x) => x.operation).lastIndexOf('delete')
    if (lastDeleteIdx >= 0) {
      out.push(group[lastDeleteIdx])
      continue
    }
    const inserts = group.filter((x) => x.operation === 'insert')
    const updates = group.filter((x) => x.operation === 'update')
    if (inserts.length && updates.length) {
      const base = inserts[inserts.length - 1]
      let data = { ...(base.data && typeof base.data === 'object' ? base.data : {}) }
      for (const u of updates) {
        if (u.data && typeof u.data === 'object') data = { ...data, ...u.data }
      }
      out.push({
        ...base,
        operation: 'insert',
        remote_id: null,
        data,
      })
      continue
    }
    if (updates.length > 1) {
      out.push(updates[updates.length - 1])
      continue
    }
    out.push(...group)
  }
  return out
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

/**
 * Сообщение после важного действия (архив, удаление), если облако не приняло очередь.
 * null = всё ушло, отдельный alert не нужен.
 * @param {{ ok?: boolean, reason?: string, remaining?: number } | null | undefined} flush
 * @param {string} actionLabel — «Архив», «Удаление»…
 */
export function criticalWriteCloudWarning(flush, actionLabel) {
  const label = String(actionLabel || 'Изменение').trim() || 'Изменение'
  const d = describeFlushQueueResult(flush)
  if (flush?.ok && !d.hadError) return null
  if (d.offline || flush?.reason === 'offline_or_stub') {
    return `${label} сохранено на этом устройстве. Нет сети — нажмите Sync, когда появится интернет.`
  }
  const detail = d.part || d.message || flush?.reason || 'неизвестно'
  return `${label} на устройстве есть, но в облако не ушло. Нажмите Sync.\n\n${detail}`
}
