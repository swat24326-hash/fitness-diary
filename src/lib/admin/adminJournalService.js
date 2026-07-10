/**
 * Журнал администратора: пагинация + фильтры на стороне Supabase (масштабирование).
 * Локальный режим — те же фильтры и нарезка страницы в памяти (ограничено размером IDB).
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { loadLocalJournalTrainingsPage } from '../localDbClubQuery'
import { fetchAdminJournalViaApi } from './adminApiClient'
import { ADMIN_JOURNAL_MAX_PAGE_SIZE } from './adminConstants'

const CHUNK = 120

/** Поля клиента для журнала и фильтра (не тянем лишние колонки). */
const CLIENT_BRIEF_FIELDS = 'id, name, phone, email, trainer_id, club_id, card_number'

export async function fetchClientsMapByIds(clientIds) {
  const map = {}
  const ids = [...new Set(clientIds.filter(Boolean))]
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { data, error } = await supabase.from('clients').select(CLIENT_BRIEF_FIELDS).in('id', chunk)
    if (error) throw error
    for (const c of data ?? []) map[c.id] = c
  }
  return map
}

async function loadLocalJournalPage(page, pageSize, filters) {
  const size = Math.min(Math.max(1, pageSize), ADMIN_JOURNAL_MAX_PAGE_SIZE)
  const local = await loadLocalJournalTrainingsPage({ page, pageSize: size, filters })
  return {
    trainings: local.trainings,
    clientsById: local.clientsById,
    totalCount: local.totalCount,
    source: 'local',
    fallbackReason: null,
  }
}

async function loadRemoteJournalPage(page, pageSize, filters) {
  const size = Math.min(Math.max(1, pageSize), ADMIN_JOURNAL_MAX_PAGE_SIZE)
  let q = supabase.from('trainings').select('*', { count: 'exact' })
  if (filters.clubId) q = q.eq('club_id', filters.clubId)
  if (filters.trainerId) q = q.eq('trainer_id', filters.trainerId)
  if (filters.clientId) q = q.eq('client_id', filters.clientId)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.dateFrom) q = q.gte('date', filters.dateFrom)
  if (filters.dateTo) q = q.lte('date', filters.dateTo)
  const start = page * size
  const end = start + size - 1
  const { data, error, count } = await q
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(start, end)
  if (error) throw error
  const rows = data ?? []
  const clientIds = rows.map((t) => t.client_id).filter(Boolean)
  const clientsById = await fetchClientsMapByIds(clientIds)
  return {
    trainings: rows,
    clientsById,
    totalCount: count ?? rows.length,
    source: 'remote',
    fallbackReason: null,
  }
}

/**
 * @param {object} p
 * @param {number} p.page — 0-based
 * @param {number} p.pageSize
 * @param {object} p.filters — clubId, trainerId, clientId, status, dateFrom, dateTo
 */
export async function loadAdminJournalPage({ page = 0, pageSize = 50, filters = {} }) {
  const f = {
    clubId: filters.clubId || '',
    trainerId: filters.trainerId || '',
    clientId: filters.clientId || '',
    status: filters.status || '',
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
  }

  if (!isSupabaseConfigured()) {
    return loadLocalJournalPage(page, pageSize, f)
  }

  try {
    const viaApi = await fetchAdminJournalViaApi({ page, pageSize, filters: f })
    if (viaApi) {
      return {
        trainings: viaApi.trainings,
        clientsById: viaApi.clientsById,
        totalCount: viaApi.totalCount,
        source: 'admin_api',
        fallbackReason: null,
      }
    }
  } catch (apiErr) {
    const msg = String(apiErr?.message ?? '')
    if (!/failed to fetch|connection reset|timeout/i.test(msg)) {
      console.warn('[admin] admin-journal api', apiErr)
    }
  }

  try {
    return await loadRemoteJournalPage(page, pageSize, f)
  } catch (e) {
    const local = await loadLocalJournalPage(page, pageSize, f)
    return {
      ...local,
      source: 'local',
      fallbackReason: e?.message ? String(e.message) : 'Не удалось загрузить страницу журнала с сервера',
    }
  }
}
