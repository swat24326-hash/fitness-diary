/**
 * Режимы списка клиентов админки: поиск-first + мини-сводка «на сегодня».
 */

import { filterOperationalClients } from '../clientArchive.js'
import { todayLocalIso } from '../dateRu.js'
import { hasUsableMembershipForPeriodStats } from '../membershipRules.js'
import { aggregateClubClientPeriod } from './clubClientPeriodAgg.js'

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
 * Сводка «на сегодня» — те же правила, что сводка дня и «Не активные» в статистике.
 * @param {object[]} clientRows
 * @param {object[]} membershipRows
 * @param {string} [today]
 */
export function buildAdminClientsTodaySnapshot(clientRows, membershipRows, today = todayLocalIso()) {
  const day = String(today ?? '').slice(0, 10)
  const operational = filterOperationalClients(clientRows)
  const period = aggregateClubClientPeriod(operational, membershipRows, day, day, day)

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
  for (const c of operational) {
    const id = String(c?.id ?? '').trim()
    if (!id) continue
    if (hasUsableMembershipForPeriodStats(memByClient.get(id) ?? [], day, day, day)) {
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
 *   minSearchLen?: number,
 * }} p
 */
export function shouldShowAdminClientsList(p) {
  if (String(p?.clientsTab ?? '') === 'archive') return true
  const min = Number(p?.minSearchLen) > 0 ? Number(p.minSearchLen) : 2
  if (String(p?.query ?? '').trim().length >= min) return true
  if (String(p?.trainerQuery ?? '').trim().length >= min) return true
  if (isAdminClientsBrowseMode(p?.browseMode)) return true
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
 * ID клиентов клуба, которые reconcile не должен удалять: активные + архивные в облаке.
 * @param {object[]} remoteRows
 */
export function remoteClientIdsForReconcile(remoteRows) {
  const ids = new Set()
  for (const row of remoteRows ?? []) {
    const id = String(row?.id ?? '').trim()
    if (id) ids.add(id)
  }
  return ids
}
