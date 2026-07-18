/**
 * Чтение IndexedDB по индексам (v9+), с fallback на getAll+filter.
 */

import { getDb } from './localDb.js'

/**
 * @param {unknown} clubId
 * @returns {string}
 */
export function normalizeClubId(clubId) {
  return String(clubId ?? '').trim()
}

/**
 * @param {unknown[]} rows
 * @param {string} clubId
 */
export function filterRowsByClubId(rows, clubId) {
  const cid = normalizeClubId(clubId)
  if (!cid) return []
  return rows.filter((r) => String(r?.club_id ?? '') === cid)
}

/**
 * @param {object} f
 * @param {object} t
 */
export function trainingMatchesJournalFilters(t, f) {
  if (f.clubId && t.club_id !== f.clubId) return false
  if (f.trainerId && t.trainer_id !== f.trainerId) return false
  if (f.clientId && t.client_id !== f.clientId) return false
  if (f.status && t.status !== f.status) return false
  if (f.dateFrom && (t.date ?? '') < f.dateFrom) return false
  if (f.dateTo && (t.date ?? '') > f.dateTo) return false
  return true
}

/**
 * @param {object[]} list
 * @param {object} f
 */
export function applyTrainingJournalFilters(list, f) {
  return list.filter((t) => trainingMatchesJournalFilters(t, f))
}

/** @param {object[]} list */
export function sortTrainingsByDateDesc(list) {
  return [...list].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
}

/**
 * @param {object[]} list
 * @param {number} page — 0-based
 * @param {number} pageSize
 */
export function sliceTrainingJournalPage(list, page, pageSize) {
  const size = Math.max(1, pageSize)
  const start = Math.max(0, page) * size
  return list.slice(start, start + size)
}

/** Дефолтное окно локального журнала (90 дней). */
export function defaultJournalDateRange() {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 90)
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  }
}

/**
 * @param {string} storeName
 * @param {string} indexName
 * @param {string | string[]} key
 */
async function getAllFromIndex(storeName, indexName, key) {
  const db = await getDb()
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  try {
    if (!store.indexNames.contains(indexName)) {
      const all = await store.getAll()
      await tx.done
      return all
    }
    const rows = await store.index(indexName).getAll(key)
    await tx.done
    return rows
  } catch {
    const all = await db.getAll(storeName)
    return all
  }
}

/**
 * @param {string} storeName
 * @param {string} clubId
 */
async function getAllFromClubIndex(storeName, clubId) {
  const cid = normalizeClubId(clubId)
  if (!cid) return []
  const rows = await getAllFromIndex(storeName, 'by_club_id', cid)
  if (rows.length && rows[0]?.club_id != null) return rows
  return filterRowsByClubId(rows, cid)
}

/**
 * @param {string} clubId
 * @param {string} dateFrom
 * @param {string} dateTo
 */
async function getTrainingsByClubDateRange(clubId, dateFrom, dateTo) {
  const cid = normalizeClubId(clubId)
  const from = String(dateFrom ?? '').slice(0, 10)
  const to = String(dateTo ?? '').slice(0, 10)
  if (!cid || !from || !to || from > to) {
    return getAllFromClubIndex('trainings', cid)
  }

  const db = await getDb()
  const tx = db.transaction('trainings', 'readonly')
  const store = tx.objectStore('trainings')
  try {
    if (store.indexNames.contains('by_club_date')) {
      const range = IDBKeyRange.bound([cid, from], [cid, to])
      const rows = await store.index('by_club_date').getAll(range)
      await tx.done
      return rows
    }
  } catch {
    /* fallback */
  }
  await tx.done
  const rows = await getAllFromClubIndex('trainings', cid)
  return rows.filter((t) => {
    const d = String(t?.date ?? '').slice(0, 10)
    return d && d >= from && d <= to
  })
}

/** @param {string} clubId */
export async function listClientsByClubId(clubId) {
  return getAllFromClubIndex('clients', clubId)
}

/** @param {string} clubId */
export async function listPnkFunnelEventsByClubId(clubId) {
  return getAllFromClubIndex('pnk_funnel_events', clubId)
}

/** @param {string} trainerId */
export async function listClientsByTrainerId(trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return []
  const rows = await getAllFromIndex('clients', 'by_trainer_id', tid)
  if (rows.length && rows[0]?.trainer_id != null) return rows
  return rows.filter((c) => String(c?.trainer_id ?? '') === tid)
}

/**
 * Подсчёт клиентов по trainer_id без getAll в память (cursor).
 * @returns {Promise<Record<string, number>>}
 */
export async function countClientsByTrainerIdLocal() {
  const db = await getDb()
  const tx = db.transaction('clients', 'readonly')
  const store = tx.objectStore('clients')
  const counts = {}
  let cursor = await store.openCursor()
  while (cursor) {
    const tid = cursor.value?.trainer_id
    if (tid) {
      const key = String(tid)
      counts[key] = (counts[key] ?? 0) + 1
    }
    cursor = await cursor.continue()
  }
  await tx.done
  return counts
}

/** @param {string} clubId */
export async function listMembershipsByClubId(clubId) {
  return getAllFromClubIndex('memberships', clubId)
}

/** @param {string} clubId */
export async function listChallengesByClubId(clubId) {
  return getAllFromClubIndex('challenges', clubId)
}

/**
 * @param {string[]} clubIds
 */
export async function listChallengesByClubIds(clubIds) {
  const ids = [...new Set((clubIds ?? []).map((id) => normalizeClubId(id)).filter(Boolean))]
  if (!ids.length) return []
  const lists = await Promise.all(ids.map((cid) => listChallengesByClubId(cid)))
  const byId = new Map()
  for (const list of lists) {
    for (const ch of list ?? []) {
      const id = String(ch?.id ?? '').trim()
      if (id && !byId.has(id)) byId.set(id, ch)
    }
  }
  return [...byId.values()]
}

/**
 * @param {string} clubId
 * @param {string} dateFrom — yyyy-mm-dd
 * @param {string} dateTo — yyyy-mm-dd
 */
export async function listTrainingsByClubIdInRange(clubId, dateFrom, dateTo) {
  return getTrainingsByClubDateRange(clubId, dateFrom, dateTo)
}

/** @param {string} trainerId */
export async function listTrainingsByTrainerId(trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return []
  const rows = await getAllFromIndex('trainings', 'by_trainer_id', tid)
  if (rows.length && rows[0]?.trainer_id != null) return rows
  return rows.filter((t) => String(t?.trainer_id ?? '') === tid)
}

/** @param {string} clientId */
export async function listTrainingsByClientId(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  const rows = await getAllFromIndex('trainings', 'by_client_id', cid)
  if (rows.length && rows[0]?.client_id != null) return rows
  return rows.filter((t) => String(t?.client_id ?? '') === cid)
}

/** @param {string} clientId */
export async function listMembershipsByClientId(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  const rows = await getAllFromIndex('memberships', 'by_client_id', cid)
  if (rows.length && rows[0]?.client_id != null) return rows
  return rows.filter((m) => String(m?.client_id ?? '') === cid)
}

/**
 * @param {string[]} clientIds
 * @returns {Promise<Record<string, object[]>>}
 */
export async function listMembershipsMapByClientIds(clientIds) {
  const map = {}
  for (const id of clientIds ?? []) {
    const cid = String(id ?? '').trim()
    if (!cid) continue
    const rows = await listMembershipsByClientId(cid)
    if (rows.length) map[cid] = rows
  }
  return map
}

/**
 * @param {string[]} clientIds
 * @param {{ clubId?: string }} [opts]
 */
export async function listTrainingsForClientIds(clientIds, opts = {}) {
  const clubId = normalizeClubId(opts?.clubId)
  const out = []
  for (const id of clientIds ?? []) {
    const cid = String(id ?? '').trim()
    if (!cid) continue
    for (const t of await listTrainingsByClientId(cid)) {
      if (clubId && String(t?.club_id ?? '') !== clubId) continue
      out.push(t)
    }
  }
  return out
}

/** @param {string} clientId */
export async function listMeasurementsByClientId(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  const rows = await getAllFromIndex('body_measurements', 'by_client_id', cid)
  const filtered =
    rows.length && rows[0]?.client_id != null ? rows : rows.filter((m) => String(m?.client_id ?? '') === cid)
  return filtered.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
}

/** @param {string} clientId */
export async function listWeightEntriesByClientId(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  const rows = await getAllFromIndex('client_weight_entries', 'by_client_id', cid)
  const filtered =
    rows.length && rows[0]?.client_id != null ? rows : rows.filter((m) => String(m?.client_id ?? '') === cid)
  return filtered.sort((a, b) => {
    const d = String(b.date ?? '').localeCompare(String(a.date ?? ''))
    if (d !== 0) return d
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))
  })
}

/**
 * Абонементы клуба → map client_id → rows (один проход по индексу club_id).
 * @param {string} clubId
 */
export async function buildMembershipsMapByClubId(clubId) {
  const rows = await listMembershipsByClubId(clubId)
  const map = {}
  for (const m of rows) {
    const cid = String(m?.client_id ?? '')
    if (!cid) continue
    if (!map[cid]) map[cid] = []
    map[cid].push(m)
  }
  return map
}

/**
 * @param {string[]} ids
 * @returns {Promise<Record<string, object>>}
 */
export async function getClientsMapByIdsLocal(ids) {
  const db = await getDb()
  const map = {}
  for (const id of [...new Set((ids ?? []).filter(Boolean))]) {
    const c = await db.get('clients', id)
    if (c) map[id] = c
  }
  return map
}

/**
 * Локальный журнал: выбор индекса + фильтры + сортировка + страница.
 * @param {{ page?: number, pageSize?: number, filters?: object }} p
 */
export async function loadLocalJournalTrainingsPage(p) {
  const page = Math.max(0, p?.page ?? 0)
  const pageSize = Math.max(1, p?.pageSize ?? 50)
  const f = {
    clubId: p?.filters?.clubId || '',
    trainerId: p?.filters?.trainerId || '',
    clientId: p?.filters?.clientId || '',
    status: p?.filters?.status || '',
    dateFrom: p?.filters?.dateFrom || '',
    dateTo: p?.filters?.dateTo || '',
  }

  if (f.clubId && !f.clientId && !f.trainerId && !f.dateFrom && !f.dateTo) {
    const def = defaultJournalDateRange()
    f.dateFrom = def.dateFrom
    f.dateTo = def.dateTo
  }

  let base = []
  if (f.clientId) {
    base = await listTrainingsByClientId(f.clientId)
  } else if (f.trainerId) {
    base = await listTrainingsByTrainerId(f.trainerId)
  } else if (f.clubId && f.dateFrom && f.dateTo) {
    base = await getTrainingsByClubDateRange(f.clubId, f.dateFrom, f.dateTo)
  } else if (f.clubId) {
    base = await getAllFromClubIndex('trainings', f.clubId)
  } else {
    const db = await getDb()
    base = await db.getAll('trainings')
  }

  const filtered = sortTrainingsByDateDesc(applyTrainingJournalFilters(base, f))
  const totalCount = filtered.length
  const trainings = sliceTrainingJournalPage(filtered, page, pageSize)
  const clientsById = await getClientsMapByIdsLocal(trainings.map((t) => t.client_id).filter(Boolean))

  return { trainings, clientsById, totalCount }
}
