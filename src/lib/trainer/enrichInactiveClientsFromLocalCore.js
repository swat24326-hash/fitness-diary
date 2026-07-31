/**
 * Подставляет ФИО/телефон из локального кэша, если API/last-good отдал «—» или пусто.
 * Профиль тренера → «Не активные».
 *
 * @param {Array<{ id?: string, name?: string, phone?: string|null }>} inactiveClients
 * @param {Array<{ id?: string, name?: string, phone?: string|null }>} localClients
 */
export function enrichInactiveClientsFromLocal(inactiveClients, localClients) {
  if (!Array.isArray(inactiveClients) || inactiveClients.length === 0) return inactiveClients ?? []

  const byId = new Map()
  for (const c of localClients ?? []) {
    const id = String(c?.id ?? '').trim()
    if (id) byId.set(id, c)
  }

  let changed = false
  const out = inactiveClients.map((row) => {
    const id = String(row?.id ?? '').trim()
    const local = byId.get(id)
    if (!local) return row

    const apiName = String(row?.name ?? '').trim()
    const needsName = !apiName || apiName === '—'
    const needsPhone = row?.phone == null || String(row.phone).trim() === ''
    if (!needsName && !needsPhone) return row

    const localName = String(local.name ?? '').trim()
    const localPhone = local.phone != null ? String(local.phone).trim() : ''
    changed = true
    return {
      ...row,
      name: needsName ? localName || apiName || '—' : row.name,
      phone: needsPhone && localPhone ? localPhone : row.phone,
    }
  })

  return changed ? out : inactiveClients
}

/** Есть ли строки без нормального имени (нужно подтянуть с устройства). */
export function inactiveClientsNeedLocalNameEnrichment(inactiveClients) {
  if (!Array.isArray(inactiveClients) || inactiveClients.length === 0) return false
  return inactiveClients.some((c) => {
    const name = String(c?.name ?? '').trim()
    return !name || name === '—'
  })
}
