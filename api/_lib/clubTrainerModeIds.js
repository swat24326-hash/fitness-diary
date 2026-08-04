/**
 * ID тренеров без планшета (и holding) для KPI на сервере.
 */

import { collectHoldingTrainerIds } from '../../src/lib/admin/holdingClientsCore.js'
import { collectNoTabletTrainerIds } from '../../src/lib/admin/trainerTabletModeCore.js'

const TRAINER_MODE_FIELDS = 'id, name, role, club_id, uses_tablet, is_system_placeholder'
const TRAINER_MODE_FIELDS_BASIC = 'id, name, role, club_id, is_system_placeholder'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {string} [clubId]
 * @returns {Promise<{ holdingTrainerIds: Set<string>, noTabletTrainerIds: Set<string> }>}
 */
export async function fetchClubTrainerModeIds(supabaseAdmin, clubId) {
  const empty = { holdingTrainerIds: new Set(), noTabletTrainerIds: new Set() }
  if (!supabaseAdmin) return empty

  let rows = []
  const full = await supabaseAdmin.from('users').select(TRAINER_MODE_FIELDS)
  if (full.error) {
    const msg = String(full.error.message ?? '').toLowerCase()
    if (!msg.includes('uses_tablet')) {
      console.warn('[trainer-mode-ids]', full.error.message)
      return empty
    }
    const basic = await supabaseAdmin.from('users').select(TRAINER_MODE_FIELDS_BASIC)
    if (basic.error) {
      console.warn('[trainer-mode-ids]', basic.error.message)
      return empty
    }
    rows = (basic.data ?? []).map((u) => ({ ...u, uses_tablet: true }))
  } else {
    rows = full.data ?? []
  }

  const cid = String(clubId ?? '').trim()
  const trainers = cid
    ? rows.filter((t) => !t.club_id || String(t.club_id) === cid)
    : rows

  return {
    holdingTrainerIds: collectHoldingTrainerIds(trainers),
    noTabletTrainerIds: collectNoTabletTrainerIds(trainers),
  }
}
