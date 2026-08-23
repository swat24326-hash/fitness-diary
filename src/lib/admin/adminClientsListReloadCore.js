/**
 * Когда перезагружать список клиентов / сводку дня (IndexedDB-события).
 */

import { dispatchLocalDataChanged } from '../localDataEvents.js'
import { invalidateAdminClientsListMemory } from './adminClientsListMemoryCache.js'
import {
  invalidateAdminDaySummaryGlance,
  invalidateAllAdminDaySummaryGlance,
} from './daySummaryGlanceSession.js'

const ADMIN_CLIENTS_LIST_RELOAD_REASONS = new Set([
  'sync-complete',
  'admin-clients-cache',
  'client-deleted',
  'trainer-club-cascade',
  'client-hydrated',
  'memberships-refreshed',
  'client-archive-changed',
  'client-hall-lifecycle',
  'client-trainer-reassigned',
  'lite-pz-client-created',
  'desk-manual-client-created',
  'desk-closing-import',
  'desk-membership-ledger',
  'payments-link-restore',
  'payments-link-lite',
  'payments-link-lite-attach',
  'payments-link-pz-attach',
  'payments-link-desk',
  'payments-link-desk-attach',
  'training-completed',
  'membership-used-reconciled',
  'membership-dates-shifted',
  'desk-az-session-deduct',
  'desk-az-session-date',
  'desk-az-session-remove',
])

const ADMIN_CLIENTS_LIST_IGNORE_REASONS = new Set([
  'exercises',
  'challenge-trainings',
  'challenge-created',
  'challenge-deleted',
  'challenge-completed',
])

/**
 * @param {object} [detail]
 */
export function shouldReloadAdminClientsList(detail = {}) {
  const reason = String(detail?.reason ?? '').trim()
  if (!reason) return true
  if (ADMIN_CLIENTS_LIST_RELOAD_REASONS.has(reason)) return true
  return !ADMIN_CLIENTS_LIST_IGNORE_REASONS.has(reason)
}

/**
 * Сводка дня на главной — те же триггеры, что и список (кроме пустого reason).
 * @param {object} [detail]
 */
export function shouldReloadAdminDaySummaryFromStorage(detail = {}) {
  const reason = String(detail?.reason ?? '').trim()
  if (!reason) return false
  return ADMIN_CLIENTS_LIST_RELOAD_REASONS.has(reason)
}

/**
 * Lifecycle для chip/list: IndexedDB свежее снимка памяти (закрытие зала на карточке).
 * @param {object[]|null|undefined} idbRows
 * @param {object[]|null|undefined} memoryRows
 */
export function resolveAdminClientsBrowseLifecycleRows(idbRows, memoryRows) {
  if (Array.isArray(idbRows)) return idbRows
  if (Array.isArray(memoryRows)) return memoryRows
  return []
}

/**
 * Сброс memory + glance главной для клуба (абоны / lifecycle изменились локально).
 * @param {string} [clubId]
 */
export function invalidateAdminClientsBrowseGlanceCaches(clubId) {
  const id = String(clubId ?? '').trim()
  if (id) {
    invalidateAdminClientsListMemory(id)
    invalidateAdminDaySummaryGlance(id)
  } else {
    invalidateAdminClientsListMemory()
    invalidateAllAdminDaySummaryGlance()
  }
}

/**
 * Единый контур: сброс memory + glance главной + событие IDB.
 * @param {{ reason: string, clubId?: string, clientId?: string, [key: string]: unknown }} detail
 */
export function notifyAdminClientsBrowseStorageChanged(detail = {}) {
  const reason = String(detail?.reason ?? '').trim()
  if (!reason) return
  invalidateAdminClientsBrowseGlanceCaches(detail.clubId)
  const id = String(detail.clientId ?? '').trim()
  const clubId = String(detail.clubId ?? '').trim()
  dispatchLocalDataChanged({
    reason,
    ...(id ? { clientId: id } : {}),
    ...(clubId ? { clubId } : {}),
  })
}

/**
 * После записи client_hall_lifecycle — сброс кэшей + событие для списка/главной.
 * @param {string} [clientId]
 * @param {{ clubId?: string }} [opts]
 */
export function notifyClientHallLifecycleChanged(clientId, opts = {}) {
  notifyAdminClientsBrowseStorageChanged({
    reason: 'client-hall-lifecycle',
    clientId,
    clubId: opts.clubId,
  })
}
