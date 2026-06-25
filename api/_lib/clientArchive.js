/** Зеркало src/lib/clientArchive.js для api/_lib/*Agg.js */

export function isClientArchived(client) {
  return Boolean(client?.archived_at)
}

export function filterOperationalClients(clientRows) {
  return (clientRows ?? []).filter((c) => !isClientArchived(c))
}
