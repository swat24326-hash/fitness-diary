/** Архив клиента — оперативные списки и «Не активные» только без archived_at. */

export function isClientArchived(client) {
  return Boolean(client?.archived_at)
}

/** Клиенты для ежедневной работы, статистики «Не активные», челленджей. */
export function filterOperationalClients(clientRows) {
  return (clientRows ?? []).filter((c) => !isClientArchived(c))
}
