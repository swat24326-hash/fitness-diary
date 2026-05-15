/**
 * Подтягивает данные клиента с Supabase в IndexedDB (для админской карточки).
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { putStore } from '../localDb'
import { ADMIN_SYNC_BATCH_SIZE } from './adminConstants'

export async function hydrateAdminClientWorkspace(clientId) {
  if (!clientId || !isSupabaseConfigured()) {
    return { ok: false, reason: 'no_client_or_supabase' }
  }
  try {
    const { data: client, error: ce } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle()
    if (ce) throw ce
    if (!client) return { ok: false, reason: 'not_found' }
    await putStore('clients', client)

    const { data: memberships, error: me } = await supabase.from('memberships').select('*').eq('client_id', clientId)
    if (me) throw me
    for (const m of memberships ?? []) await putStore('memberships', m)

    const { data: hc, error: he } = await supabase.from('health_cards').select('*').eq('client_id', clientId).maybeSingle()
    if (he) throw he
    if (hc) await putStore('health_cards', hc)

    let mFrom = 0
    for (;;) {
      const { data: mRows, error: be } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(mFrom, mFrom + ADMIN_SYNC_BATCH_SIZE - 1)
      if (be) throw be
      const chunk = mRows ?? []
      if (!chunk.length) break
      for (const row of chunk) await putStore('body_measurements', row)
      if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
      mFrom += ADMIN_SYNC_BATCH_SIZE
    }

    let from = 0
    for (;;) {
      const { data: trains, error: te } = await supabase
        .from('trainings')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1)
      if (te) throw te
      const rows = trains ?? []
      if (!rows.length) break
      for (const t of rows) await putStore('trainings', t)
      if (rows.length < ADMIN_SYNC_BATCH_SIZE) break
      from += ADMIN_SYNC_BATCH_SIZE
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message ? String(e.message) : String(e) }
  }
}
