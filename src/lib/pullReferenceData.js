/**
 * Подтягивание справочников (упражнения, челленджи) через Vercel API.
 */

import { getDb, listSyncQueue, putStore } from './localDb'
import { isSupabaseConfigured } from './supabase'
import { fetchChallengesForClubViaApi } from './admin/adminApiClient'
import { pullExercisesFromCloud } from './exerciseCatalog'

export { pullExercisesFromCloud }

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
    for (const row of rows) {
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
