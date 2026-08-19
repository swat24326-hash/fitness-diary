/**
 * Чтение client_restore_events для retention API (service role).
 */

import { RETENTION_REACTIVATION_LOOKBACK_DAYS } from '../../src/lib/admin/clientRetentionCore.js'
import { isClientRestoreEventsTableMissing } from '../../src/lib/admin/clientRestoreEventCore.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {{
 *   clubId: string,
 *   asOf: string,
 *   lookbackDays?: number,
 *   trainerIdFilter?: string | null,
 * }} opts
 * @returns {Promise<Array<{ clientId: string, restoredAt: string }>>}
 */
export async function fetchClientRestoreEventsForRetention(supabaseAdmin, opts) {
  const clubId = String(opts.clubId ?? '').trim()
  const asOf = String(opts.asOf ?? '').slice(0, 10)
  if (!supabaseAdmin || !clubId || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return []

  const lookbackDays = Number(opts.lookbackDays) || RETENTION_REACTIVATION_LOOKBACK_DAYS
  const parts = asOf.split('-').map(Number)
  const lookbackMs =
    Date.UTC(parts[0], parts[1] - 1, parts[2]) - lookbackDays * 86400000
  const lookbackFrom = new Date(lookbackMs).toISOString()
  const asOfEnd = `${asOf}T23:59:59.999Z`

  try {
    let q = supabaseAdmin
      .from('client_restore_events')
      .select('client_id, restored_at, trainer_id')
      .eq('club_id', clubId)
      .gte('restored_at', lookbackFrom)
      .lte('restored_at', asOfEnd)
      .order('restored_at', { ascending: false })
      .limit(5000)

    const trainerIdFilter = opts.trainerIdFilter ? String(opts.trainerIdFilter).trim() : ''
    if (trainerIdFilter) q = q.eq('trainer_id', trainerIdFilter)

    const { data, error } = await q
    if (error) {
      if (isClientRestoreEventsTableMissing(error)) return []
      console.warn('[client-restore-events] fetch', error.message)
      return []
    }

    return (data ?? []).map((row) => ({
      clientId: String(row.client_id ?? '').trim(),
      restoredAt: String(row.restored_at ?? '').slice(0, 10),
    })).filter((r) => r.clientId && r.restoredAt)
  } catch (e) {
    console.warn('[client-restore-events] fetch', e?.message ?? e)
    return []
  }
}
