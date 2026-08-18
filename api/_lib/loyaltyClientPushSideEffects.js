/**
 * Побочные эффекты лояльности при push clients: burn_archive / club_move.
 * Не ломает архив/переезд, если таблиц лояльности ещё нет.
 */

import { buildLoyaltyAccount } from '../../src/lib/loyalty/loyaltyAccountCore.js'
import { loyaltyRatesFromSettings } from '../../src/lib/loyalty/loyaltySettingsCore.js'
import {
  detectLoyaltyArchiveBurn,
  detectLoyaltyClubMove,
  mergeClientAfterPush,
} from '../../src/lib/loyalty/loyaltyClientMutationCore.js'
import {
  clubOpsAsOfIso,
  insertLoyaltyLedgerRow,
  isLoyaltyTableMissing,
  loadLoyaltyAccountBundle,
  loadLoyaltyMembershipTypes,
  loadLoyaltySettingsRow,
} from './adminData/loyaltyAccountQuery.js'

async function liveSnapshot(supabase, clientRow) {
  const clubId = String(clientRow?.club_id ?? '').trim()
  const clientId = String(clientRow?.id ?? '').trim()
  if (!clubId || !clientId) return null
  const [settings, types] = await Promise.all([
    loadLoyaltySettingsRow(supabase, clubId),
    loadLoyaltyMembershipTypes(supabase, clubId),
  ])
  const bundle = await loadLoyaltyAccountBundle(supabase, {
    clientId,
    clubId,
    clientRow: { ...clientRow, archived_at: null },
    settings,
    types,
  })
  return { snapshot: buildLoyaltyAccount(bundle), settings }
}

/**
 * После успешного insert/update clients.
 * @param {{
 *   supabaseAdmin: object,
 *   before?: object|null,
 *   payload?: object|null,
 *   actorId?: string|null,
 * }} p
 */
export async function applyLoyaltyClientPushSideEffects(p = {}) {
  const supabase = p.supabaseAdmin
  if (!supabase) return
  const after = mergeClientAfterPush(p.before, p.payload)
  const actor_id = p.actorId ?? null
  const asOf = clubOpsAsOfIso()
  const nowIso = new Date().toISOString()

  try {
    const burn = detectLoyaltyArchiveBurn({ before: p.before, after })
    if (burn.write) {
      let points = 0
      let snapshot = {}
      try {
        const live = await liveSnapshot(supabase, { ...after, archived_at: null, club_id: burn.clubId, id: burn.clientId })
        points = Number(live?.snapshot?.points) || 0
        snapshot = live?.settings ? loyaltyRatesFromSettings(live.settings) : {}
      } catch (e) {
        if (isLoyaltyTableMissing(e)) return
        console.warn('[loyalty] archive snapshot', e?.message ?? e)
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
        payload: {},
      })
    }

    const move = detectLoyaltyClubMove({ before: p.before, after, asOf, nowIso })
    if (move.write) {
      await insertLoyaltyLedgerRow(supabase, {
        club_id: move.to,
        client_id: move.clientId,
        kind: 'club_move',
        at: move.at || nowIso,
        actor_id,
        payload: { from: move.from, to: move.to, club_moved_on: move.asOf },
      })
      await insertLoyaltyLedgerRow(supabase, {
        club_id: move.from,
        client_id: move.clientId,
        kind: 'club_move',
        at: move.at || nowIso,
        actor_id,
        payload: { left: true, from: move.from, to: move.to },
      })
    }
  } catch (e) {
    if (isLoyaltyTableMissing(e)) return
    console.warn('[loyalty] client push side effects', e?.message ?? e)
  }
}
