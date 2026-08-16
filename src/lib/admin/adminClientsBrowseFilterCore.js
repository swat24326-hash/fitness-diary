/**
 * Плитки «Клиенты» и список по фильтру — один контур (tabBase + воронка).
 * Census/commercial — только stats / period agg, не сюда.
 *
 * Критические правила:
 * - chip = list на вкладке (без поиска), кроме ДР: плитка = сегодня, список = окно;
 * - АЗ-направление сужает и chip, и list;
 * - cross-hall поиск → сброс воронки (иначе chip≠list и hallMode врёт).
 */

import {
  clientMatchesAdminFunnelFilter,
  countAdminFunnelFilters,
  isAdminPnkClient,
} from './adminClientsFunnelCore.js'
import {
  clientMatchesAzDirectionFilter,
  normalizeAzDirectionFilterId,
} from './adminClientsAzDirectionFilterCore.js'
import {
  filterClientsByAdminListTab,
  normalizeAdminClientsListTab,
} from './deskHallClientsCore.js'
import { filterCommercialClients } from './holdingClientsCore.js'
import { BIRTHDAY_WINDOW_DAYS } from '../clientBirthdays.js'

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
 * hallMode для match/count: вкладка ТЗ/АЗ или ПЗ.
 * Cross-hall search не меняет hallMode — воронку при поиске сбрасывают.
 * @param {string} clientsTab
 */
export function resolveAdminClientsBrowseHallMode(clientsTab) {
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
 * Воронку на список Архива не вешаем: tabBase подменяет archive→active,
 * пересечение с архивным пулом даёт пустой список (ломает вкладку).
 * @param {string} clientsTab
 * @param {string} [browseMode]
 */
export function shouldApplyAdminClientsBrowseFilterToList(clientsTab, browseMode) {
  if (normalizeAdminClientsListTab(clientsTab) === 'archive') return false
  const mode = String(browseMode ?? '').trim()
  if (!mode || mode === 'none') return false
  return ADMIN_CLIENTS_BROWSE_FUNNEL_KEYS.includes(mode)
}

/**
 * Сужение АЗ по направлению (пустое = без сужения).
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} clientsTab
 * @param {string} [azDirectionFilter]
 * @param {string} [today]
 */
export function applyAzDirectionToBrowsePool(clients, memByClient, clientsTab, azDirectionFilter, today) {
  if (normalizeAdminClientsListTab(clientsTab) !== 'az') return clients ?? []
  const want = normalizeAzDirectionFilterId(azDirectionFilter)
  if (!want) return clients ?? []
  const day = String(today ?? '').slice(0, 10)
  return (clients ?? []).filter((c) =>
    clientMatchesAzDirectionFilter(memListForAdminClient(c, memByClient), want, day),
  )
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
 *   azDirectionFilter?: string,
 * }} p
 */
export function filterAdminClientsByBrowseMode(p) {
  const mode = String(p?.browseMode ?? '').trim()
  let base = filterAdminClientsBrowseTabBase(p.clients, p.clientsTab, p.memByClient)
  base = applyAzDirectionToBrowsePool(
    base,
    p.memByClient,
    p.clientsTab,
    p.azDirectionFilter,
    p.today,
  )
  if (!mode || mode === 'none') return base

  const hallMode = resolveAdminClientsBrowseHallMode(p.clientsTab)
  const today = String(p.today ?? '').slice(0, 10)

  if (mode === 'all') {
    return base.filter((c) => !isAdminPnkClient(c))
  }

  return base.filter((c) =>
    clientMatchesAdminFunnelFilter(mode, adminClientBrowseMatchCtx(c, today, hallMode, p.memByClient)),
  )
}

/**
 * Цифры на плитках = filterAdminClientsByBrowseMode (вкладка + опц. АЗ-направление).
 * @param {{
 *   clients: object[],
 *   memByClient: Record<string, object[]>,
 *   clientsTab: string,
 *   today: string,
 *   azDirectionFilter?: string,
 * }} p
 */
export function buildAdminClientsBrowseCounts(p) {
  let tabBase = filterAdminClientsBrowseTabBase(p.clients, p.clientsTab, p.memByClient)
  tabBase = applyAzDirectionToBrowsePool(
    tabBase,
    p.memByClient,
    p.clientsTab,
    p.azDirectionFilter,
    p.today,
  )
  const hallMode = resolveAdminClientsBrowseHallMode(p.clientsTab)
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
 * Подпись плитки «Все» — явно без ПНК на ПЗ.
 * @param {string} clientsTab
 * @param {{ pnk?: number }} [counts]
 */
export function adminClientsAllTileLabel(clientsTab, counts = {}) {
  const tab = normalizeAdminClientsListTab(clientsTab)
  if (tab === 'active' && (Number(counts.pnk) || 0) > 0) return 'Все (без ПНК)'
  if (tab === 'active') return 'Все клиенты'
  return 'Все клиенты'
}

/**
 * Строка «Показано: …» — один источник для UI.
 * @param {{
 *   crossHallSearch?: boolean,
 *   browseMode?: string,
 *   browseLabel?: string | null,
 *   azDirectionLabel?: string | null,
 *   listLength?: number,
 * }} p
 */
export function formatAdminClientsResultsShown(p = {}) {
  const n = Number.isFinite(p.listLength) ? Number(p.listLength) : null
  const suffix = n != null && n >= 0 ? ` · ${n}` : ''

  if (p.crossHallSearch) {
    return { title: 'Поиск по клубу', detail: 'ПЗ, ТЗ и АЗ', suffix, clearBrowse: false }
  }

  const mode = String(p.browseMode ?? '').trim()
  if (!mode || mode === 'none') {
    if (p.azDirectionLabel) {
      return { title: `АЗ · ${p.azDirectionLabel}`, detail: null, suffix, clearBrowse: true }
    }
    return null
  }

  const label = String(p.browseLabel ?? mode).trim() || mode
  const az = p.azDirectionLabel ? ` · ${p.azDirectionLabel}` : ''
  return { title: label + az, detail: null, suffix, clearBrowse: true }
}

/**
 * Подсказка к воронке при cross-hall поиске.
 */
export function adminClientsCrossHallSearchNote() {
  return 'Поиск по всему клубу (ПЗ, ТЗ и АЗ). Сводка на сегодня — по вкладке, не по выдаче поиска. Фильтр воронки сброшен.'
}

/** @param {string} [browseMode] */
export function adminClientsBirthdaysEmptyHint(browseMode) {
  if (String(browseMode) !== 'birthdays') return null
  return `Нет дней рождения сегодня и в ближайшие ${BIRTHDAY_WINDOW_DAYS} дней (проверьте дату в карточке).`
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
 * Verify: chip N === list length для browse-фильтров на вкладке.
 * Исключение: `birthdays` — плитка только «сегодня», список = окно ближайших ДР.
 * @param {{
 *   clients: object[],
 *   memByClient: Record<string, object[]>,
 *   clientsTab: string,
 *   today: string,
 *   azDirectionFilter?: string,
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
    if (key === 'birthdays') continue
    const listLen = filterAdminClientsByBrowseMode({ ...p, browseMode: key }).length
    const chip = Number(counts[key]) || 0
    if (chip !== listLen) mismatches.push({ key, chip, list: listLen })
  }
  return { ok: mismatches.length === 0, mismatches }
}
