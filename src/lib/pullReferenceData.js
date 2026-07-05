/**
 * Подтягивание справочников (упражнения, челленджи) через Vercel API.
 */

import { buildPendingSyncKeysByTable, getDb, listSyncQueue, putStore } from './localDb'
import { shouldPreserveLocalRowOnPull } from './syncFlushResult'
import { isSupabaseConfigured } from './supabase'
import { fetchChallengesForClubViaApi } from './admin/adminApiClient'
import { pullExercisesFromCloud } from './exerciseCatalog'

export { pullExercisesFromCloud }

export async function pullMembershipTypesForClubFromCloud(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured()) return { ok: false, reason: 'no_club_or_supabase' }

  const mergeRows = async (rows, source) => {
    const { mergeMembershipTypesForClub, notifyMembershipTypesChanged } = await import('./membershipTypesService')
    const { count } = await mergeMembershipTypesForClub(cid, rows)
    if (count > 0) notifyMembershipTypesChanged(cid, { count, source })
    return { ok: true, count, source }
  }

  try {
    const { fetchMembershipTypesForClubViaApi } = await import('./admin/adminApiClient')
    const viaApi = await fetchMembershipTypesForClubViaApi(cid)
    if (viaApi) {
      return mergeRows(viaApi.membership_types ?? [], 'api')
    }
  } catch (e) {
    if (!/failed to fetch|connection|timeout|таймаут|сеть/i.test(String(e?.message ?? ''))) {
      return { ok: false, error: String(e?.message ?? e ?? 'Ошибка загрузки типов абонементов') }
    }
  }

  try {
    const { supabase } = await import('./supabase')
    const { withSupabaseRetry } = await import('./supabaseRetry')
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from('membership_types')
        .select('id, club_id, code, sort_order, is_active, trainer_pay_per_session, created_at')
        .eq('club_id', cid)
        .order('sort_order', { ascending: true }),
    )
    if (error) throw error
    return mergeRows(data ?? [], 'supabase')
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e ?? 'Ошибка загрузки типов абонементов') }
  }
}

/** Удалить из IndexedDB челленджи клуба, которых уже нет в облаке (после удаления админом). */
export async function reconcileChallengesForClub(clubId, remoteChallenges) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { pruned: 0 }

  const remoteIds = new Set((remoteChallenges ?? []).map((c) => String(c.id)).filter(Boolean))
  const pendingIds = new Set()
  for (const item of await listSyncQueue()) {
    if (item.table_name !== 'challenges') continue
    const op = item.operation
    if (op !== 'insert' && op !== 'update') continue
    const id = String(item.remote_id ?? item.data?.id ?? '').trim()
    if (id) pendingIds.add(id)
  }

  const db = await getDb()
  let pruned = 0
  for (const ch of await db.getAll('challenges')) {
    if (String(ch.club_id) !== cid) continue
    const id = String(ch.id ?? '')
    if (!id || remoteIds.has(id) || pendingIds.has(id)) continue
    await db.delete('challenges', id)
    pruned++
  }
  return { pruned }
}

export async function pullChallengesForClubFromCloud(clubId) {
  const cid = String(clubId ?? '').trim()
  if (!cid || !isSupabaseConfigured()) return { ok: false, reason: 'no_club_or_supabase' }

  try {
    const viaApi = await fetchChallengesForClubViaApi(cid)
    if (!viaApi) {
      return {
        ok: false,
        reason: 'no_api',
        error: 'Сервер челленджей недоступен — обновите страницу (Ctrl+F5) и повторите Sync.',
      }
    }
    const rows = viaApi.challenges ?? []
    const pending = await buildPendingSyncKeysByTable()
    const db = await getDb()
    for (const row of rows) {
      const id = String(row?.id ?? '').trim()
      const existing = id ? await db.get('challenges', id) : null
      if (shouldPreserveLocalRowOnPull(pending.challenges, id, existing)) continue
      await putStore('challenges', row)
    }
    const { pruned } = await reconcileChallengesForClub(cid, rows)
    if (pruned > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fitness-diary-storage', { detail: { reason: 'challenge-deleted' } }),
      )
    }
    return { ok: true, count: viaApi.count, source: 'api', pruned }
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e ?? 'Ошибка загрузки челленджей') }
  }
}
