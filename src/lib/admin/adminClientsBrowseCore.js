/**
 * Режимы списка клиентов админки: поиск-first + мини-сводка «на сегодня».
 */

import { filterCommercialClients } from './holdingClientsCore.js'
import { todayLocalIso } from '../dateRu.js'
import {
  hasUsableMembershipForPeriodStats,
  membershipCoversDate,
  inactiveMembershipReferenceDate,
} from '../membershipRules.js'
import { aggregateClubClientPeriod } from './clubClientPeriodAgg.js'

function hasCommercialActiveOnDay(memList, day) {
  if (hasUsableMembershipForPeriodStats(memList, day, day, day)) return true
  const ref = inactiveMembershipReferenceDate(day, day, day)
  for (const m of memList ?? []) {
    const total = Number(m?.total_trainings ?? 0)
    if (Number.isFinite(total) && total > 0) continue
    if (membershipCoversDate(m, ref)) return true
  }
  return false
}

/** Режимы, при которых показываем список без строки поиска. */
export const ADMIN_CLIENTS_BROWSE_MODES = [
  'all',
  'inactive',
  'pnk',
  'awaiting_start',
  'birthdays',
  'expiring',
  'expired_recent',
  'stale',
]
/** @param {string} mode */
export function isAdminClientsBrowseMode(mode) {
  return ADMIN_CLIENTS_BROWSE_MODES.includes(String(mode ?? ''))
}

/**
 * Сводка «на сегодня» — абоны (в т.ч. lite ПЗ); «Неактивные» без lite (пустой дневник).
 * @param {object[]} clientRows
 * @param {object[]} membershipRows
 * @param {string} [today]
 * @param {Set<string>|string[]} [holdingTrainerIds]
 * @param {Set<string>|string[]} [noTabletTrainerIds]
 */
export function buildAdminClientsTodaySnapshot(
  clientRows,
  membershipRows,
  today = todayLocalIso(),
  holdingTrainerIds,
  noTabletTrainerIds,
) {
  const day = String(today ?? '').slice(0, 10)
  const period = aggregateClubClientPeriod(clientRows, membershipRows, day, day, day, {
    holdingTrainerIds,
    noTabletTrainerIds,
  })

  const inactiveDetailById = new Map()
  for (const row of period.inactiveClients) {
    if (row?.id) inactiveDetailById.set(row.id, row)
  }

  const activeTodayIds = new Set()
  const memByClient = new Map()
  for (const m of membershipRows ?? []) {
    const cid = String(m?.client_id ?? '').trim()
    if (!cid) continue
    if (!memByClient.has(cid)) memByClient.set(cid, [])
    memByClient.get(cid).push(m)
  }
  const commercial = filterCommercialClients(clientRows, holdingTrainerIds).filter(
    (c) => String(c?.lifecycle ?? 'active') !== 'pnk',
  )
  for (const c of commercial) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    if (hasCommercialActiveOnDay(memByClient.get(id) ?? [], day)) {
      activeTodayIds.add(id)
    }
  }

  return {
    today: day,
    totalOperational: period.totalClients,
    inactiveCount: period.inactiveInPeriod,
    activeTodayCount: period.activeWithMembership,
    inactiveIds: new Set(period.inactiveClients.map((c) => c.id).filter(Boolean)),
    activeTodayIds,
    inactiveDetailById,
  }
}

/**
 * @param {{
 *   query?: string,
 *   trainerQuery?: string,
 *   browseMode?: string,
 *   clientsTab?: string,
 *   azDirectionFilter?: string,
 *   minSearchLen?: number,
 * }} p
 */
export function shouldShowAdminClientsList(p) {
  const tab = String(p?.clientsTab ?? '')
  if (tab === 'archive') return true
  const min = Number(p?.minSearchLen) > 0 ? Number(p.minSearchLen) : 2
  if (String(p?.query ?? '').trim().length >= min) return true
  if (String(p?.trainerQuery ?? '').trim().length >= min) return true
  if (isAdminClientsBrowseMode(p?.browseMode)) return true
  // Вкладка АЗ: выбранное направление само открывает список
  if (String(p?.azDirectionFilter ?? '').trim()) return true
  return false
}

/**
 * Какие локальные client id удалит reconcile (чистая логика для verify).
 * @param {object[]} localClients
 * @param {object[]} remoteRows — активные + архивные из облака
 * @param {Set<string>} pendingClientIds
 * @param {{ preserveArchived?: boolean }} [opts]
 */
export function planAdminClubReconcilePrune(localClients, remoteRows, pendingClientIds, opts = {}) {
  const preserveArchived = opts?.preserveArchived === true
  const remoteIds = remoteClientIdsForReconcile(remoteRows)
  const toPrune = []
  for (const c of localClients ?? []) {
    if (preserveArchived && c?.archived_at) continue
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    if (remoteIds.has(id)) continue
    if (pendingClientIds?.has(id)) continue
    toPrune.push(id)
  }
  return toPrune
}

/**
 * @param {object[]} remoteRows
 * @returns {Set<string>}
 */
export function remoteClientIdsForReconcile(remoteRows) {
  const ids = new Set()
  for (const r of remoteRows ?? []) {
    const id = String(r?.id ?? '').trim()
    if (id) ids.add(id)
  }
  return ids
}

/**
 * Плитки Клиентов = adminClientsBrowseFilterCore.js (tabBase + воронка).
 * @param {object} funnel
 * @param {{ totalOperational?: number }} [_snapshot]
 */
export function mergeAdminPzBrowseFilterCounts(funnel, _snapshot = {}) {
  return { ...funnel }
}

export {
  adminClientBrowseMatchCtx,
  adminClientsAllTileLabel,
  adminClientsCrossHallSearchNote,
  applyAzDirectionToBrowsePool,
  buildAdminClientsBrowseCounts,
  buildAdminPzDaySummaryBrowseCounts,
  filterAdminClientsByBrowseMode,
  filterCommercialCensusOnAdminTab,
  formatAdminClientsResultsShown,
  resolveAdminClientsBrowseHallMode,
  resolveAdminClientsFunnelPool,
  verifyAdminClientsBrowseChipParity,
} from './adminClientsBrowseFilterCore.js'
