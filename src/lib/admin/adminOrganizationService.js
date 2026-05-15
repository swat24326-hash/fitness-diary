/**
 * Клубы + тренеры: чтение тренеров с club_id и смена клуба (Supabase).
 */

import { getDb } from '../localDb'
import { supabase, isSupabaseConfigured } from '../supabase'

const TRAINER_FIELDS = 'id, name, phone, email, login, is_active, role, club_id'

/**
 * @returns {Promise<{ trainers: object[], clubColumn: boolean }>}
 */
export async function listTrainersWithClubForAdmin() {
  if (!isSupabaseConfigured()) return { trainers: [], clubColumn: false }
  const tryFull = await supabase.from('users').select(TRAINER_FIELDS).eq('role', 'trainer').order('name', { ascending: true })
  if (!tryFull.error) {
    return { trainers: tryFull.data ?? [], clubColumn: true }
  }
  const basic = await supabase
    .from('users')
    .select('id, name, phone, email, login, is_active, role')
    .eq('role', 'trainer')
    .order('name', { ascending: true })
  if (basic.error) throw basic.error
  const rows = (basic.data ?? []).map((u) => ({ ...u, club_id: null }))
  return { trainers: rows, clubColumn: false }
}

/**
 * @param {{ trainerId: string, clubId: string | null }} p — clubId null = без клуба
 */
export async function updateTrainerClubForAdmin(p) {
  const { trainerId, clubId } = p
  if (!trainerId) throw new Error('trainer_id required')
  const { error } = await supabase.from('users').update({ club_id: clubId || null }).eq('id', trainerId).eq('role', 'trainer')
  if (error) throw error
}

/** Число клиентов у тренера (облако или локальный кэш). */
export async function countClientsByTrainer(trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return 0
  if (!isSupabaseConfigured()) {
    const db = await getDb()
    return (await db.getAll('clients')).filter((c) => c.trainer_id === tid).length
  }
  const { count, error } = await supabase.from('clients').select('id', { count: 'exact', head: true }).eq('trainer_id', tid)
  if (error) throw error
  return count ?? 0
}

/**
 * Удаление тренера (Auth + users). Edge Function `delete-trainer` с service role.
 * Клиентов у тренера быть не должно — иначе ошибка.
 */
export async function deleteTrainerForAdmin(trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) throw new Error('Не указан тренер')
  if (!isSupabaseConfigured()) throw new Error('Удаление тренера доступно только при подключённом Supabase')
  const n = await countClientsByTrainer(tid)
  if (n > 0) throw new Error(`У тренера есть клиенты (${n}). Переназначьте или удалите их.`)
  const { data, error } = await supabase.functions.invoke('delete-trainer', { body: { trainer_id: tid } })
  if (error) {
    let detail = error.message
    try {
      const res = error.context
      if (res && typeof res.json === 'function') {
        const blob = await res.json()
        if (blob?.error) detail = String(blob.error)
      }
    } catch {
      /* ignore */
    }
    throw new Error(detail || 'Вызов delete-trainer не удался')
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error))
  }
}
