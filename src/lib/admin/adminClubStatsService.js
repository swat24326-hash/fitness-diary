/**
 * Статистика тренировок по клубу за период (батчами с Supabase / агрегация в IndexedDB).
 */

import { supabase, isSupabaseConfigured } from '../supabase'
import { withSupabaseRetry } from '../supabaseRetry'
import { getDb } from '../localDb'
import { hasUsableMembershipOnDate } from '../membershipRules'
import { fetchClubTrainingStatsViaApi } from './adminApiClient'
import { ADMIN_SYNC_BATCH_SIZE } from './adminConstants'
import { aggregateMembershipTypeStats } from './membershipTypeStatsAgg'
import { listMembershipTypesForClub } from '../membershipTypesService'

export function aggregateTrainings(rows) {
  const dayMap = new Map()
  const trainerMap = new Map()
  const clientSet = new Set()
  let totalCompleted = 0
  let totalDraft = 0

  for (const t of rows) {
    const d = String(t.date ?? '').slice(0, 10)
    if (!d) continue
    const isDone = t.status === 'completed'
    const isDraft = t.status === 'draft'
    if (!isDone && !isDraft) continue

    const tid = t.trainer_id || ''
    if (isDone) totalCompleted++
    if (isDraft) totalDraft++
    if (t.client_id) clientSet.add(t.client_id)

    if (!dayMap.has(d)) dayMap.set(d, { completed: 0, draft: 0 })
    const day = dayMap.get(d)
    if (isDone) day.completed++
    if (isDraft) day.draft++

    if (tid) {
      if (!trainerMap.has(tid)) {
        trainerMap.set(tid, { completed: 0, draft: 0, clientIds: new Set() })
      }
      const tr = trainerMap.get(tid)
      if (isDone) tr.completed++
      if (isDraft) tr.draft++
      if (t.client_id) tr.clientIds.add(t.client_id)
    }
  }

  const byDay = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, completed: v.completed, draft: v.draft }))

  const byTrainer = [...trainerMap.entries()]
    .map(([trainerId, v]) => ({
      trainerId,
      completed: v.completed,
      draft: v.draft,
      uniqueClients: v.clientIds.size,
    }))
    .sort((a, b) => b.completed - a.completed || b.draft - a.draft)

  return {
    totalCompleted,
    totalDraft,
    uniqueClients: clientSet.size,
    totalRows: rows.length,
    byDay,
    byTrainer,
  }
}

async function fetchTrainingsForClubRangeRemote(clubId, dateFrom, dateTo) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from('trainings')
        .select('id, trainer_id, client_id, date, status, data')
        .eq('club_id', clubId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1),
    )
    if (error) throw error
    const chunk = data ?? []
    if (!chunk.length) break
    rows.push(...chunk)
    if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return rows
}

async function fetchTrainingsForClubRangeLocal(clubId, dateFrom, dateTo) {
  const db = await getDb()
  const all = await db.getAll('trainings')
  return all.filter((t) => {
    if (t.club_id !== clubId) return false
    const d = String(t.date ?? '').slice(0, 10)
    return d && d >= dateFrom && d <= dateTo
  })
}

async function fetchClientsForClubRemote(clubId) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await withSupabaseRetry(() =>
      supabase
        .from('clients')
        .select('id, name, phone')
        .eq('club_id', clubId)
        .order('id', { ascending: true })
        .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1),
    )
    if (error) throw error
    const chunk = data ?? []
    if (!chunk.length) break
    rows.push(...chunk)
    if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return rows
}

async function fetchClientsForClubLocal(clubId) {
  const db = await getDb()
  const all = await db.getAll('clients')
  return all
    .filter((c) => c.club_id === clubId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
    }))
}

async function fetchMembershipsForClubRemote(clubId) {
  const rows = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('memberships')
      .select('id, client_id, start_date, end_date, total_trainings, used_trainings, membership_type_id')
      .eq('club_id', clubId)
      .order('id', { ascending: true })
      .range(from, from + ADMIN_SYNC_BATCH_SIZE - 1)
    if (error) throw error
    const chunk = data ?? []
    if (!chunk.length) break
    rows.push(...chunk)
    if (chunk.length < ADMIN_SYNC_BATCH_SIZE) break
    from += ADMIN_SYNC_BATCH_SIZE
  }
  return rows
}

async function fetchMembershipsForClubLocal(clubId) {
  const db = await getDb()
  const all = await db.getAll('memberships')
  return all.filter((m) => m.club_id === clubId)
}

/**
 * @param {{ id: string }[]} clientRows
 * @param {Array<{ client_id?: string, start_date?: string, end_date?: string, total_trainings?: number, used_trainings?: number }>} membershipRows
 * @param {string} dateFrom yyyy-mm-dd
 * @param {string} dateTo yyyy-mm-dd
 */
export function aggregateClubClientPeriod(clientRows, membershipRows, dateFrom, dateTo) {
  const totalClients = clientRows.length
  const clientIdSet = new Set(clientRows.map((c) => c.id).filter(Boolean))
  const clientById = new Map()
  for (const c of clientRows ?? []) {
    const id = String(c?.id ?? '').trim()
    if (id) clientById.set(id, c)
  }
  const byClient = new Map()
  for (const id of clientIdSet) byClient.set(id, [])
  for (const m of membershipRows) {
    const cid = m.client_id
    if (!cid || !clientIdSet.has(cid)) continue
    byClient.get(cid).push(m)
  }

  let activeWithMembership = 0
  const notRenewedClients = []
  const inactiveClients = []

  for (const id of clientIdSet) {
    const mems = byClient.get(id) ?? []
    if (hasUsableMembershipOnDate(mems, dateTo)) {
      activeWithMembership++
      continue
    }
    const endsInRange = []
    for (const m of mems) {
      const e = String(m.end_date ?? '').slice(0, 10)
      if (e && e >= dateFrom && e <= dateTo) endsInRange.push(e)
    }
    if (!endsInRange.length) continue

    endsInRange.sort((a, b) => a.localeCompare(b))
    const client = clientById.get(id)
    notRenewedClients.push({
      id,
      name: String(client?.name ?? '').trim() || '—',
      phone: client?.phone ? String(client.phone).trim() : null,
      membershipEnded: endsInRange[endsInRange.length - 1],
    })
  }

  const notRenewedSet = new Set(notRenewedClients.map((c) => c.id))
  for (const id of clientIdSet) {
    if (notRenewedSet.has(id)) continue
    const mems = byClient.get(id) ?? []
    if (hasUsableMembershipOnDate(mems, dateTo)) continue
    const client = clientById.get(id)
    inactiveClients.push({
      id,
      name: String(client?.name ?? '').trim() || '—',
      phone: client?.phone ? String(client.phone).trim() : null,
    })
  }
  inactiveClients.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  notRenewedClients.sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  return {
    totalClients,
    activeWithMembership,
    notRenewedInPeriod: notRenewedClients.length,
    notRenewedClients,
    inactiveClients,
  }
}

async function membershipTypeStatsSlice(clubId, trainings, memberships) {
  const membershipTypes = await listMembershipTypesForClub(clubId)
  return aggregateMembershipTypeStats({ trainings, memberships, membershipTypes })
}

/**
 * @param {{ clubId: string, dateFrom: string, dateTo: string }} p — даты ISO yyyy-mm-dd
 */
export async function loadClubTrainingStats(p) {
  const { clubId, dateFrom, dateTo } = p
  const base = {
    totalCompleted: 0,
    totalDraft: 0,
    uniqueClients: 0,
    totalRows: 0,
    byDay: [],
    byTrainer: [],
    byType: [],
    byTrainerByType: [],
    totalCounted: 0,
    totalClients: 0,
    activeWithMembership: 0,
    notRenewedInPeriod: 0,
    notRenewedClients: [],
    inactiveClients: [],
    source: 'local',
    fallbackReason: null,
    error: null,
  }

  if (!clubId || !dateFrom || !dateTo || dateFrom > dateTo) {
    return { ...base, error: !clubId ? 'no_club' : 'bad_range' }
  }

  const clientSlice = (clients, memberships) => aggregateClubClientPeriod(clients, memberships, dateFrom, dateTo)

  if (!isSupabaseConfigured()) {
    const [rows, clients, memberships] = await Promise.all([
      fetchTrainingsForClubRangeLocal(clubId, dateFrom, dateTo),
      fetchClientsForClubLocal(clubId),
      fetchMembershipsForClubLocal(clubId),
    ])
    return {
      ...base,
      ...aggregateTrainings(rows),
      ...clientSlice(clients, memberships),
      ...(await membershipTypeStatsSlice(clubId, rows, memberships)),
      source: 'local',
    }
  }

  try {
    const viaApi = await fetchClubTrainingStatsViaApi({ clubId, dateFrom, dateTo })
    if (viaApi) {
      return {
        ...base,
        totalCompleted: viaApi.totalCompleted ?? 0,
        totalDraft: viaApi.totalDraft ?? 0,
        uniqueClients: viaApi.uniqueClients ?? 0,
        totalRows: viaApi.totalRows ?? 0,
        byDay: viaApi.byDay ?? [],
        byTrainer: viaApi.byTrainer ?? [],
        byType: viaApi.byType ?? [],
        byTrainerByType: viaApi.byTrainerByType ?? [],
        totalCounted: viaApi.totalCounted ?? 0,
        totalClients: viaApi.totalClients ?? 0,
        activeWithMembership: viaApi.activeWithMembership ?? 0,
        notRenewedInPeriod: viaApi.notRenewedInPeriod ?? 0,
        notRenewedClients: viaApi.notRenewedClients ?? [],
        inactiveClients: viaApi.inactiveClients ?? [],
        source: 'admin_api',
        fallbackReason: null,
        error: null,
      }
    }
  } catch (apiErr) {
    const msg = String(apiErr?.message ?? '')
    if (!/failed to fetch|connection reset|timeout/i.test(msg)) {
      console.warn('[admin] club-training-stats api', apiErr)
    }
  }

  try {
    const [rows, clients, memberships] = await Promise.all([
      fetchTrainingsForClubRangeRemote(clubId, dateFrom, dateTo),
      fetchClientsForClubRemote(clubId),
      fetchMembershipsForClubRemote(clubId),
    ])
    return {
      ...base,
      ...aggregateTrainings(rows),
      ...clientSlice(clients, memberships),
      ...(await membershipTypeStatsSlice(clubId, rows, memberships)),
      source: 'remote',
    }
  } catch (e) {
    const [rows, clients, memberships] = await Promise.all([
      fetchTrainingsForClubRangeLocal(clubId, dateFrom, dateTo),
      fetchClientsForClubLocal(clubId),
      fetchMembershipsForClubLocal(clubId),
    ])
    return {
      ...base,
      ...aggregateTrainings(rows),
      ...clientSlice(clients, memberships),
      ...(await membershipTypeStatsSlice(clubId, rows, memberships)),
      source: 'local',
      fallbackReason: e?.message ? String(e.message) : 'Статистика с сервера недоступна',
    }
  }
}
