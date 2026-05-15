/**
 * Медкарты для админки: батч по client_id (Supabase или IndexedDB).
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { getDb } from '../localDb'

const CHUNK = 120

async function loadLocalMap(clientIds) {
  const db = await getDb()
  const map = {}
  for (const id of clientIds) {
    const row = await db.get('health_cards', id)
    map[id] = row ?? null
  }
  return map
}

async function loadRemoteMap(clientIds) {
  const map = {}
  for (let i = 0; i < clientIds.length; i += CHUNK) {
    const chunk = clientIds.slice(i, i + CHUNK)
    const { data, error } = await supabase.from('health_cards').select('*').in('client_id', chunk)
    if (error) throw error
    for (const row of data ?? []) {
      map[row.client_id] = row
    }
  }
  for (const id of clientIds) {
    if (map[id] === undefined) map[id] = null
  }
  return map
}

/**
 * @param {string[]} clientIds
 * @returns {Promise<{ healthByClientId: Record<string, object|null>, source: 'remote'|'local', fallbackReason: string|null }>}
 */
export async function loadAdminHealthCardsByClientIds(clientIds) {
  const ids = [...new Set((clientIds ?? []).filter(Boolean))]
  if (!ids.length) {
    return { healthByClientId: {}, source: 'local', fallbackReason: null }
  }

  if (!isSupabaseConfigured()) {
    const healthByClientId = await loadLocalMap(ids)
    return { healthByClientId, source: 'local', fallbackReason: null }
  }

  try {
    const healthByClientId = await loadRemoteMap(ids)
    return { healthByClientId, source: 'remote', fallbackReason: null }
  } catch (e) {
    const healthByClientId = await loadLocalMap(ids)
    return {
      healthByClientId,
      source: 'local',
      fallbackReason: e?.message ? String(e.message) : 'Не удалось загрузить медкарты с сервера',
    }
  }
}
