/**
 * Burn лояльности при закрытии ПЗ (без архива клуба).
 */
import { buildLoyaltyAccount } from '../../src/lib/loyalty/loyaltyAccountCore.js'
import { loyaltyRatesFromSettings } from '../../src/lib/loyalty/loyaltySettingsCore.js'
import { detectLoyaltyPzHallCloseBurn } from '../../src/lib/clientHallLifecycleCore.js'
import {
  insertLoyaltyLedgerRow,
  isLoyaltyTableMissing,
  loadLoyaltyAccountBundle,
  loadLoyaltyMembershipTypes,
  loadLoyaltySettingsRow,
} from './adminData/loyaltyAccountQuery.js'
import {
  LOYALTY_PUSH_SNAPSHOT_TIMEOUT_MS,
  raceWithTimeout,
} from '../../src/lib/loyalty/loyaltyTimeoutCore.js'

async function liveSnapshot(supabase, clientId, clubId) {
  if (!clubId || !clientId) return null
  const [settings, types] = await Promise.all([
    loadLoyaltySettingsRow(supabase, clubId),
    loadLoyaltyMembershipTypes(supabase, clubId),
  ])
  const bundle = await loadLoyaltyAccountBundle(supabase, {
    clientId,
    clubId,
    clientRow: { id: clientId, club_id: clubId, archived_at: null },
    settings,
    types,
  })
  return { snapshot: buildLoyaltyAccount(bundle), settings }
}

/**
 * @param {{
 *   supabaseAdmin: object,
 *   before?: object|null,
 *   after?: object|null,
 *   actorId?: string|null,
 * }} p
 */
export async function applyLoyaltyHallLifecyclePushSideEffects(p = {}) {
  const supabase = p.supabaseAdmin
  if (!supabase) return
  const burn = detectLoyaltyPzHallCloseBurn({ before: p.before, after: p.after })
  if (!burn.write) return

  const actor_id = p.actorId ?? null
  const nowIso = new Date().toISOString()

  try {
    let points = 0
    let snapshot = {}
    try {
      const live = await raceWithTimeout(
        liveSnapshot(supabase, burn.clientId, burn.clubId),
        LOYALTY_PUSH_SNAPSHOT_TIMEOUT_MS,
        'loyalty snapshot timeout',
      )
      points = Number(live?.snapshot?.points) || 0
      snapshot = live?.settings ? loyaltyRatesFromSettings(live.settings) : {}
    } catch (e) {
      if (!isLoyaltyTableMissing(e)) {
        console.warn('[loyalty] pz-close snapshot', e?.message ?? e)
      }
    }
    await insertLoyaltyLedgerRow(supabase, {
      club_id: burn.clubId,
      client_id: burn.clientId,
      kind: 'burn_archive',
      at: (() => {
        const d = new Date(burn.at)
        return Number.isNaN(d.getTime()) ? nowIso : d.toISOString()
      })(),
      points,
      actor_id,
      snapshot,
      payload: { source: 'pz_hall_close' },
    })
  } catch (e) {
    if (isLoyaltyTableMissing(e)) return
    console.warn('[loyalty] hall lifecycle push side effects', e?.message ?? e)
  }
}
