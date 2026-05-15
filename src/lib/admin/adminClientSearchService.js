/**
 * Поиск клиентов для фильтра админ-журнала (десятки тысяч записей — без полного списка в UI).
 * Подстрока: имя/телефон клиента или ФИО закреплённого тренера.
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { getDb } from '../localDb'
import { ADMIN_CLIENT_SEARCH_LIMIT } from './adminConstants'

const CLIENT_BRIEF_FIELDS = 'id, name, phone, email, trainer_id, club_id'

/** Экранирование спецсимволов LIKE / ILIKE. */
export function escapeForIlike(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
}

let localClientsSnapshot = null

/** id тренера → имя (кэш для локального поиска по ФИО тренера). */
let trainerNameByIdCache = null
let trainerNameByIdCacheAt = 0
const TRAINER_NAME_CACHE_MS = 60_000

export function clearAdminClientSearchLocalCache() {
  localClientsSnapshot = null
  trainerNameByIdCache = null
  trainerNameByIdCacheAt = 0
}

async function getTrainerNameByIdMap() {
  const now = Date.now()
  if (trainerNameByIdCache && now - trainerNameByIdCacheAt < TRAINER_NAME_CACHE_MS) {
    return trainerNameByIdCache
  }
  const m = new Map()
  if (!isSupabaseConfigured()) {
    trainerNameByIdCache = m
    trainerNameByIdCacheAt = now
    return m
  }
  try {
    const { data, error } = await supabase.from('users').select('id, name').eq('role', 'trainer')
    if (error) throw error
    for (const u of data ?? []) {
      if (u?.id) m.set(u.id, String(u.name ?? '').trim())
    }
  } catch {
    /* без имён тренеров поиск только по клиенту */
  }
  trainerNameByIdCache = m
  trainerNameByIdCacheAt = now
  return m
}

async function getLocalClientsSnapshot() {
  if (localClientsSnapshot) return localClientsSnapshot
  const db = await getDb()
  localClientsSnapshot = await db.getAll('clients')
  return localClientsSnapshot
}

/**
 * Поиск в IndexedDB (офлайн): один раз грузит клиентов в память, дальше фильтрует по подстроке.
 * При очень больших базах используйте Supabase.
 */
export async function searchAdminClientsLocal({ query, clubId, limit = ADMIN_CLIENT_SEARCH_LIMIT }) {
  const q = String(query ?? '').trim().toLowerCase()
  if (q.length < 2) return []
  const [all, trainerMap] = await Promise.all([getLocalClientsSnapshot(), getTrainerNameByIdMap()])
  const out = []
  for (const c of all) {
    if (clubId && c.club_id !== clubId) continue
    const name = String(c.name ?? '').toLowerCase()
    const phone = String(c.phone ?? '').toLowerCase()
    const trName = String(trainerMap.get(c.trainer_id) ?? '').toLowerCase()
    const byTrainer = trName && trName.includes(q)
    if (!name.includes(q) && !phone.includes(q) && !byTrainer) continue
    out.push({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      trainer_id: c.trainer_id,
      club_id: c.club_id,
    })
    if (out.length >= limit) break
  }
  return out
}

/**
 * Поиск в Supabase: ilike по имени/телефону клиента и по ФИО тренера (через users + trainer_id).
 */
export async function searchAdminClientsRemote({ query, clubId, limit = ADMIN_CLIENT_SEARCH_LIMIT }) {
  const raw = String(query ?? '').trim()
  if (raw.length < 2) return []
  const pattern = `%${escapeForIlike(raw)}%`
  const part = Math.min(limit, Math.max(20, Math.ceil(limit / 3)))

  let qName = supabase.from('clients').select(CLIENT_BRIEF_FIELDS).ilike('name', pattern).limit(part)
  let qPhone = supabase.from('clients').select(CLIENT_BRIEF_FIELDS).ilike('phone', pattern).limit(part)
  const qTrainerUsers = supabase.from('users').select('id').eq('role', 'trainer').ilike('name', pattern).limit(part)
  if (clubId) {
    qName = qName.eq('club_id', clubId)
    qPhone = qPhone.eq('club_id', clubId)
  }

  const [{ data: byName, error: e1 }, { data: byPhone, error: e2 }, { data: trainerHits, error: e3 }] = await Promise.all([
    qName,
    qPhone,
    qTrainerUsers,
  ])
  if (e1) throw e1
  if (e2) throw e2

  const tidList = e3 ? [] : [...new Set((trainerHits ?? []).map((t) => t.id).filter(Boolean))]
  let byTrainer = []
  if (tidList.length) {
    let qc = supabase.from('clients').select(CLIENT_BRIEF_FIELDS).in('trainer_id', tidList).limit(part)
    if (clubId) qc = qc.eq('club_id', clubId)
    const { data, error: e4 } = await qc
    if (e4) throw e4
    byTrainer = data ?? []
  }

  const map = new Map()
  for (const c of [...(byName ?? []), ...(byPhone ?? []), ...byTrainer]) {
    if (c?.id && !map.has(c.id)) map.set(c.id, c)
  }
  return [...map.values()].slice(0, limit)
}

/**
 * @param {{ query: string, clubId?: string }} p
 */
export async function searchAdminClientsForJournal(p) {
  const { query, clubId = '' } = p
  if (!isSupabaseConfigured()) {
    return searchAdminClientsLocal({ query, clubId })
  }
  try {
    return await searchAdminClientsRemote({ query, clubId })
  } catch {
    return searchAdminClientsLocal({ query, clubId })
  }
}
