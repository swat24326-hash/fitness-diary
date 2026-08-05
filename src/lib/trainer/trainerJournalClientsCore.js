/**
 * Клиенты для журнала/статистики тренировок: активные + архив (имя не теряется после архивации).
 * Чистая логика без IDB.
 */

/**
 * @param {object[]|null|undefined} activeClients
 * @param {object[]|null|undefined} archivedClients
 * @param {object[]|null|undefined} extraClients
 * @returns {Record<string, object>}
 */
export function buildJournalClientsById(activeClients, archivedClients, extraClients) {
  /** @type {Record<string, object>} */
  const map = {}
  for (const list of [archivedClients, activeClients, extraClients]) {
    for (const c of list ?? []) {
      const id = String(c?.id ?? '').trim()
      if (!id) continue
      map[id] = c
    }
  }
  return map
}

/**
 * Подпись клиента в таблице журнала (не сырой UUID).
 * @param {Record<string, object>|null|undefined} clientsById
 * @param {unknown} clientId
 * @returns {string}
 */
export function journalClientDisplayName(clientsById, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return '—'
  const name = String(clientsById?.[id]?.name ?? '').trim()
  if (name) return name
  if (clientsById?.[id]?.archived_at) return 'Клиент в архиве'
  return 'Клиент недоступен'
}

/**
 * № карты для строки журнала.
 * @param {Record<string, object>|null|undefined} clientsById
 * @param {unknown} clientId
 * @returns {string}
 */
export function journalClientCardNumber(clientsById, clientId) {
  const id = String(clientId ?? '').trim()
  if (!id) return '—'
  const card = String(clientsById?.[id]?.card_number ?? '').trim()
  return card || '—'
}
