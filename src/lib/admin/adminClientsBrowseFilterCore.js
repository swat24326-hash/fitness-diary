/**
 * Плитки «Клиенты» и список по фильтру — один контур (tabBase + воронка).
 * Census/commercial — только stats / period agg, не сюда.
 */

import {
  clientMatchesAdminFunnelFilter,
  countAdminFunnelFilters,
  isAdminPnkClient,
} from './adminClientsFunnelCore.js'
import {
  filterClientsByAdminListTab,
  normalizeAdminClientsListTab,
} from './deskHallClientsCore.js'
import { filterCommercialClients } from './holdingClientsCore.js'

/** Фильтры воронки на экране Клиенты (без none). */
export const ADMIN_CLIENTS_BROWSE_FUNNEL_KEYS = [
  'all',
  'inactive',
  'pnk',
  'awaiting_start',
  'birthdays',
  'expiring',
  'expired_recent',
  'stale',
]

/**
 * hallMode для match/count: вкладка ТЗ/АЗ или ПЗ; при cross-hall search — только ПЗ-abon slice.
 * @param {string} clientsTab
 * @param {{ crossHallSearch?: boolean }} [opts]
 */
export function resolveAdminClientsBrowseHallMode(clientsTab, opts = {}) {
  if (opts.crossHallSearch) return 'pz'
  const tab = normalizeAdminClientsListTab(clientsTab)
  if (tab === 'tz' || tab === 'az') return tab
  return 'pz'
}

/**
 * Базовый пул вкладки (ПЗ / ТЗ / АЗ). На «Архив» плитки считают как ПЗ (UI их не показывает).
 * @param {object[]} clients
 * @param {string} clientsTab
 * @param {Record<string, object[]>} memByClient
 */
export function filterAdminClientsBrowseTabBase(clients, clientsTab, memByClient) {
  const tab = normalizeAdminClientsListTab(clientsTab)
  const countTab = tab === 'archive' ? 'active' : tab
  return filterClientsByAdminListTab(clients, countTab, memByClient)
}

/**
 * @param {object} client
 * @param {Record<string, object[]>} memByClient
 */
export function memListForAdminClient(client, memByClient) {
  const id = client?.id != null ? String(client.id) : ''
  if (!id) return []
  return memByClient[id] ?? memByClient[client.id] ?? []
}

/**
 * @param {object} client
 * @param {string} today
 * @param {string} hallMode
 * @param {Record<string, object[]>} memByClient
 */
export function adminClientBrowseMatchCtx(client, today, hallMode, memByClient) {
  return {
    client,
    memList: memListForAdminClient(client, memByClient),
    today,
    hallMode,
  }
}

/**
 * Список по режиму browse без поиска (chip = длина этого списка на вкладке).
 * @param {{
 *   clients: object[],
 *   memByClient: Record<string, object[]>,
 *   clientsTab: string,
 *   today: string,
 *   browseMode: string,
 *   crossHallSearch?: boolean,
 * }} p
 */
export function filterAdminClientsByBrowseMode(p) {
  const mode = String(p?.browseMode ?? '').trim()
  const base = filterAdminClientsBrowseTabBase(p.clients, p.clientsTab, p.memByClient)
  if (!mode || mode === 'none') return base

  const hallMode = resolveAdminClientsBrowseHallMode(p.clientsTab, {
    crossHallSearch: p.crossHallSearch,
  })
  const today = String(p.today ?? '').slice(0, 10)

  if (mode === 'all') {
    return base.filter((c) => !isAdminPnkClient(c))
  }

  return base.filter((c) =>
    clientMatchesAdminFunnelFilter(mode, adminClientBrowseMatchCtx(c, today, hallMode, p.memByClient)),
  )
}

/**
 * Цифры на плитках = filterAdminClientsByBrowseMode (без cross-hall).
 * @param {{
 *   clients: object[],
 *   memByClient: Record<string, object[]>,
 *   clientsTab: string,
 *   today: string,
 * }} p
 */
export function buildAdminClientsBrowseCounts(p) {
  const tabBase = filterAdminClientsBrowseTabBase(p.clients, p.clientsTab, p.memByClient)
  const hallMode = resolveAdminClientsBrowseHallMode(p.clientsTab, { crossHallSearch: false })
  return countAdminFunnelFilters(tabBase, p.memByClient, p.today, null, { hallMode })
}

/**
 * Плитки сводки дня (ПЗ) = те же counts, что Clients → ПЗ.
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} today
 */
export function buildAdminPzDaySummaryBrowseCounts(clients, memByClient, today) {
  return buildAdminClientsBrowseCounts({
    clients,
    memByClient,
    clientsTab: 'active',
    today,
  })
}

/**
 * Commercial census на вкладке — stats/API, не плитки Clients.
 * @param {object[]} tabClients
 * @param {string} clientsTab
 * @param {Set<string>|string[]|null|undefined} [holdingTrainerIds]
 */
export function filterCommercialCensusOnAdminTab(tabClients, clientsTab, holdingTrainerIds) {
  const tab = normalizeAdminClientsListTab(clientsTab)
  if (tab === 'active') {
    return filterCommercialClients(tabClients ?? [], holdingTrainerIds)
  }
  return Array.isArray(tabClients) ? tabClients : []
}

/** @deprecated use filterCommercialCensusOnAdminTab */
export const resolveAdminClientsFunnelPool = filterCommercialCensusOnAdminTab

/**
 * Verify: chip N === list length для каждого browse-фильтра на вкладке.
 * @param {{
 *   clients: object[],
 *   memByClient: Record<string, object[]>,
 *   clientsTab: string,
 *   today: string,
 *   keys?: string[],
 * }} p
 * @returns {{ ok: boolean, mismatches: Array<{ key: string, chip: number, list: number }> }}
 */
export function verifyAdminClientsBrowseChipParity(p) {
  const counts = buildAdminClientsBrowseCounts(p)
  const keys = p.keys ?? ADMIN_CLIENTS_BROWSE_FUNNEL_KEYS
  /** @type {Array<{ key: string, chip: number, list: number }>} */
  const mismatches = []
  for (const key of keys) {
    const listLen = filterAdminClientsByBrowseMode({ ...p, browseMode: key }).length
    const chip = Number(counts[key]) || 0
    if (chip !== listLen) mismatches.push({ key, chip, list: listLen })
  }
  return { ok: mismatches.length === 0, mismatches }
}
