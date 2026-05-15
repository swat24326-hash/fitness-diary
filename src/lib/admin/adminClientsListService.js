/**
 * Список клиентов для админки: по клубу (Supabase / IndexedDB).
 * Без club_id в облаке не выполняем неограниченный select.
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { getDb } from '../localDb'
import { ADMIN_CLIENTS_REMOTE_LIMIT } from './adminConstants'

/**
 * @param {{ clubId?: string }} p
 * @returns {Promise<{ clients: object[], source: string, fallbackReason: string | null, cloudNeedsClub?: boolean, truncated?: boolean }>}
 */
export async function listAdminClientsForClub(p) {
  const clubId = String(p?.clubId ?? '').trim()

  if (!isSupabaseConfigured()) {
    const db = await getDb()
    let all = await db.getAll('clients')
    if (clubId) all = all.filter((c) => c.club_id === clubId)
    all.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
    return { clients: all, source: 'local', fallbackReason: null, truncated: false }
  }

  if (!clubId) {
    return { clients: [], source: 'remote', fallbackReason: null, cloudNeedsClub: true, truncated: false }
  }

  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('club_id', clubId)
      .order('name', { ascending: true })
      .limit(ADMIN_CLIENTS_REMOTE_LIMIT)
    if (error) throw error
    const rows = data ?? []
    return {
      clients: rows,
      source: 'remote',
      fallbackReason: null,
      truncated: rows.length >= ADMIN_CLIENTS_REMOTE_LIMIT,
    }
  } catch (e) {
    const db = await getDb()
    let all = await db.getAll('clients')
    all = all.filter((c) => c.club_id === clubId)
    all.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ru'))
    return {
      clients: all,
      source: 'local',
      fallbackReason: e?.message ? String(e.message) : 'Сервер недоступен',
      truncated: false,
    }
  }
}
