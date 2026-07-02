/**
 * Справочник типов абонементов (клуб): локальный кэш + push в облако (админ).
 */

import { isSupabaseConfigured } from './supabase'
import { getDb, putStore, listSyncQueue, buildPendingSyncKeysByTable } from './localDb'
import { saveLocalWithSync } from './syncService'
import { pushRecordViaApi } from './syncApiClient'
import { markRecordFromCloud } from './syncUnsyncedCore'
import { parseTrainerPayRate } from './admin/trainerPayrollCore.js'

export function normalizeMembershipTypeCode(raw) {
  return String(raw ?? '').trim().slice(0, 12)
}

function normalizeRow(row) {
  const codeRaw = row.code ?? row.name
  const payRaw = row.trainer_pay_per_session
  const payParsed = payRaw == null || payRaw === '' ? 0 : parseTrainerPayRate(payRaw)
  return {
    ...row,
    code: normalizeMembershipTypeCode(codeRaw),
    club_id: String(row.club_id ?? '').trim(),
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    trainer_pay_per_session: Number.isNaN(payParsed) ? 0 : payParsed,
  }
}

async function pushTypeOp(operation, row, remoteId) {
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { cloudOk: false, cloudError: 'Нет сети — тип только на этом устройстве. Нажмите Sync позже.' }
  }
  const push = await pushRecordViaApi({
    table_name: 'membership_types',
    operation,
    data: row,
    remote_id: remoteId ?? row.id ?? null,
    local_id: null,
  })
  return push.ok
    ? { cloudOk: true, record: push.record }
    : { cloudOk: false, cloudError: push.error ?? 'Не удалось отправить в облако' }
}

/** @param {string} clubId @param {{ activeOnly?: boolean }} [opts] */
export async function listMembershipTypesForClub(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  const db = await getDb()
  const all = await db.getAll('membership_types')
  let list = all.filter((t) => String(t.club_id) === cid)
  if (opts.activeOnly) list = list.filter((t) => t.is_active !== false)
  return list.sort(
    (a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      String(a.code ?? '').localeCompare(String(b.code ?? ''), 'ru'),
  )
}

/** @param {Map<string, object>|object[]} typesOrMap @param {string|null|undefined} typeId */
export function membershipTypeCode(typesOrMap, typeId) {
  const id = String(typeId ?? '').trim()
  if (!id) return ''
  if (typesOrMap instanceof Map) {
    return typesOrMap.get(id)?.code ?? ''
  }
  const hit = (typesOrMap ?? []).find((t) => String(t.id) === id)
  return hit?.code ?? ''
}

/** @returns {Promise<{ cloudOk: boolean, cloudError?: string }>} */
export async function insertMembershipType({ club_id, code, sort_order = 0 }) {
  const cid = String(club_id ?? '').trim()
  const normalizedCode = normalizeMembershipTypeCode(code)
  if (!cid || !normalizedCode) {
    return { cloudOk: false, cloudError: 'Укажите клуб и короткое название типа' }
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const row = normalizeRow({
    id,
    club_id: cid,
    code: normalizedCode,
    sort_order,
    is_active: true,
    trainer_pay_per_session: 0,
    created_at: now,
  })
  await saveLocalWithSync('membership_types', row, {
    table_name: 'membership_types',
    operation: 'insert',
    remote_id: null,
  })
  return pushTypeOp('insert', row, null)
}

/** Мягкое удаление: is_active = false. */
export async function deactivateMembershipType(id) {
  const tid = String(id ?? '').trim()
  if (!tid) return { cloudOk: false, cloudError: 'Нет id типа' }

  const db = await getDb()
  const prev = await db.get('membership_types', tid)
  if (!prev) return { cloudOk: false, cloudError: 'Тип не найден' }

  const row = normalizeRow({ ...prev, is_active: false })
  await saveLocalWithSync('membership_types', row, {
    table_name: 'membership_types',
    operation: 'update',
    remote_id: tid,
  })
  return pushTypeOp('update', row, tid)
}

/** @param {string} id @param {string|number} rawPay */
export async function updateMembershipTypePay(id, rawPay) {
  const tid = String(id ?? '').trim()
  if (!tid) return { cloudOk: false, cloudError: 'Нет id типа' }
  const pay = parseTrainerPayRate(rawPay)
  if (Number.isNaN(pay)) {
    return { cloudOk: false, cloudError: 'Оплата: неотрицательное число' }
  }

  const db = await getDb()
  const prev = await db.get('membership_types', tid)
  if (!prev) return { cloudOk: false, cloudError: 'Тип не найден' }

  const row = normalizeRow({ ...prev, trainer_pay_per_session: pay })
  await saveLocalWithSync('membership_types', row, {
    table_name: 'membership_types',
    operation: 'update',
    remote_id: tid,
  })
  return pushTypeOp('update', row, tid)
}

/** @param {string} clubId @param {object[]} remoteRows */
export async function mergeMembershipTypesForClub(clubId, remoteRows) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { count: 0 }

  const pendingIds = new Set()
  for (const item of await listSyncQueue()) {
    if (item.table_name !== 'membership_types') continue
    if (item.operation !== 'insert' && item.operation !== 'update') continue
    const id = String(item.remote_id ?? item.data?.id ?? '').trim()
    if (id) pendingIds.add(id)
  }

  const remoteIds = new Set()
  for (const row of remoteRows ?? []) {
    const id = String(row?.id ?? '').trim()
    if (!id || String(row.club_id) !== cid) continue
    remoteIds.add(id)
    if (pendingIds.has(id)) continue
    await putStore('membership_types', markRecordFromCloud(normalizeRow(row)))
  }

  /* Пустой ответ облака не удаляем локально — иначе Sync стирает типы, если push ещё не дошёл. */
  if (remoteIds.size === 0) {
    return { count: 0 }
  }

  const db = await getDb()
  for (const local of await db.getAll('membership_types')) {
    if (String(local.club_id) !== cid) continue
    const id = String(local.id ?? '')
    if (!id || remoteIds.has(id) || pendingIds.has(id)) continue
    await db.delete('membership_types', id)
  }

  return { count: remoteIds.size }
}

/**
 * Типы с pull приходят без synced — не считать их «ожидающими отправку», если нет локальной правки (__sync).
 * @returns {Promise<number>}
 */
export async function reconcileMembershipTypesFromCloudCache() {
  const pending = await buildPendingSyncKeysByTable()
  const pendingKeys = pending.membership_types ?? new Set()
  const db = await getDb()
  let fixed = 0

  for (const row of await db.getAll('membership_types')) {
    if (row.synced === true) continue
    const id = String(row.id ?? '').trim()
    if (!id || pendingKeys.has(id)) continue
    if (row.__sync && typeof row.__sync === 'object') continue
    const { __sync: _m, ...rest } = row
    await putStore('membership_types', { ...rest, synced: true })
    fixed++
  }

  return fixed
}
