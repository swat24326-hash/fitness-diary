/**
 * Запись client_restore_events после push clients (service role).
 * Ошибка журнала не блокирует push.
 */

import {
  buildClientRestoreEventInsertRow,
  detectClientRestoreEvent,
  isClientRestoreEventsTableMissing,
} from '../../src/lib/admin/clientRestoreEventCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{
 *   before?: object|null,
 *   payload?: object|null,
 *   actorId?: string|null,
 *   source?: string,
 * }} opts
 */
export async function recordClientRestoreEvent(supabaseAdmin, opts = {}) {
  if (!supabaseAdmin) return { ok: false, reason: 'no_client' }
  const detected = detectClientRestoreEvent(opts.before, opts.payload)
  if (!detected) return { ok: false, skipped: true }

  const row = buildClientRestoreEventInsertRow({
    clubId: detected.clubId,
    clientId: detected.clientId,
    trainerId: detected.trainerId,
    priorArchivedAt: detected.priorArchivedAt,
    priorArchiveReason: detected.priorArchiveReason,
    restoredBy: opts.actorId ?? null,
    source: opts.source ?? 'push',
  })

  try {
    const { error } = await supabaseAdmin.from('client_restore_events').insert(row)
    if (error) {
      if (isClientRestoreEventsTableMissing(error)) {
        return { ok: false, reason: 'table_missing' }
      }
      console.warn('[client-restore-event] insert', error.message)
      return { ok: false, reason: error.message }
    }
    return { ok: true }
  } catch (e) {
    console.warn('[client-restore-event] insert', e?.message ?? e)
    return { ok: false, reason: String(e?.message ?? e) }
  }
}
