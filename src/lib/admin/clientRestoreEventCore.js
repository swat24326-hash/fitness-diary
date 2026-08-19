/**
 * Журнал restore клиента — чистые правила (без React / fetch).
 */

import { isRestoreEvent } from './clientRetentionCore.js'
import { mergeClientAfterPush } from '../loyalty/loyaltyClientMutationCore.js'

/**
 * @param {unknown} error
 */
export function isClientRestoreEventsTableMissing(error) {
  const msg = String(error?.message ?? error ?? '')
  return /does not exist|schema cache|client_restore_events/i.test(msg)
}

/**
 * @param {object|null|undefined} before
 * @param {object|null|undefined} payload
 */
export function detectClientRestoreEvent(before, payload) {
  const after = mergeClientAfterPush(before, payload)
  if (!isRestoreEvent(before, after)) return null
  const clientId = String(after.id ?? before?.id ?? '').trim()
  const clubId = String(after.club_id ?? before?.club_id ?? '').trim()
  if (!clientId || !clubId) return null
  const trainerId = String(after.trainer_id ?? before?.trainer_id ?? '').trim() || null
  return {
    clientId,
    clubId,
    trainerId,
    priorArchivedAt: before?.archived_at ?? null,
    priorArchiveReason: before?.archive_reason ?? null,
  }
}

/**
 * @param {{
 *   clubId: string,
 *   clientId: string,
 *   trainerId?: string | null,
 *   restoredAt?: string,
 *   priorArchivedAt?: string | null,
 *   priorArchiveReason?: string | null,
 *   restoredBy?: string | null,
 *   source?: string,
 * }} row
 */
export function buildClientRestoreEventInsertRow(row) {
  const restoredAt = row.restoredAt ? String(row.restoredAt) : new Date().toISOString()
  return {
    club_id: String(row.clubId ?? '').trim(),
    client_id: String(row.clientId ?? '').trim(),
    trainer_id: row.trainerId ? String(row.trainerId).trim() : null,
    restored_at: restoredAt,
    prior_archived_at: row.priorArchivedAt ?? null,
    prior_archive_reason: row.priorArchiveReason
      ? String(row.priorArchiveReason).slice(0, 200)
      : null,
    restored_by: row.restoredBy ? String(row.restoredBy).trim() : null,
    source: row.source === 'admin_api' ? 'admin_api' : 'push',
  }
}
