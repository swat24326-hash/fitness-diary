/**
 * Клубы + тренеры: чтение тренеров с club_id и смена клуба (Supabase).
 */

import { listClientsByTrainerId } from '../localDbClubQuery'
import { supabase, isSupabaseConfigured } from '../supabase'
import { withSupabaseRetry } from '../supabaseRetry'
import { USERS_TRAINER_ROLES } from '../userRoleConstants'
import { fetchTrainersViaAdminApi } from './adminApiClient'
import { updateTrainerClubViaApi } from '../profileApiClient'

const TRAINER_FIELDS = 'id, name, phone, email, login, is_active, role, club_id'

/**
 * @returns {Promise<{ trainers: object[], clubColumn: boolean, listSource: 'admin_api' | 'supabase' | 'none' }>}
 */
export async function listTrainersWithClubForAdmin() {
  if (!isSupabaseConfigured()) {
    return { trainers: [], clubColumn: false, listSource: 'none' }
  }

  const viaApi = await fetchTrainersViaAdminApi()
  if (viaApi) {
    if (viaApi.trainers.length === 0 && typeof sessionStorage !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('fit-admin-trainers-cache')
        if (raw) {
          const cached = JSON.parse(raw)
          if (Array.isArray(cached) && cached.length > 0) {
            return {
              trainers: cached,
              clubColumn: true,
              listSource: 'admin_api',
              fromCache: true,
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    return { ...viaApi, listSource: 'admin_api' }
  }
  /* null = нет GET /api/list-trainers (старый деплой или только vite dev без Vercel). */

  const tryFull = await withSupabaseRetry(() =>
    supabase.from('users').select(TRAINER_FIELDS).in('role', USERS_TRAINER_ROLES).order('name', { ascending: true }),
  )
  if (!tryFull.error) {
    return { trainers: tryFull.data ?? [], clubColumn: true, listSource: 'supabase' }
  }
  const basic = await withSupabaseRetry(() =>
    supabase
      .from('users')
      .select('id, name, phone, email, login, is_active, role')
      .in('role', USERS_TRAINER_ROLES)
      .order('name', { ascending: true }),
  )
  if (basic.error) throw basic.error
  const rows = (basic.data ?? []).map((u) => ({ ...u, club_id: null }))
  return { trainers: rows, clubColumn: false, listSource: 'supabase' }
}

/**
 * @param {{ trainerId: string, clubId: string | null }} p — clubId null = без клуба
 */
export async function updateTrainerClubForAdmin(p) {
  const { trainerId, clubId } = p
  if (!trainerId) throw new Error('trainer_id required')
  const cid = clubId || null
  if (!cid) throw new Error('Выберите клуб')

  const viaApi = await updateTrainerClubViaApi(trainerId, cid)
  if (viaApi.usedApi) {
    if (viaApi.error) throw viaApi.error
    return
  }

  const { error } = await supabase
    .from('users')
    .update({ club_id: cid })
    .eq('id', trainerId)
    .in('role', USERS_TRAINER_ROLES)
  if (error) throw error
}

/** Число клиентов у тренера (облако или локальный кэш). */
export async function countClientsByTrainer(trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return 0
  if (!isSupabaseConfigured()) {
    return (await listClientsByTrainerId(tid)).length
  }
  const { count, error } = await withSupabaseRetry(() =>
    supabase.from('clients').select('id', { count: 'exact', head: false }).eq('trainer_id', tid).limit(0),
  )
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
