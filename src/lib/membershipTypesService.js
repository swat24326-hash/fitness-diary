/**
 * Справочник типов абонементов (клуб): локальный кэш + push в облако (админ).
 */

import { shouldPullMembershipTypes } from './membershipTypesPullCore.js'
import { isSupabaseConfigured } from './supabase'
import { getDb, putStore, listSyncQueue, buildPendingSyncKeysByTable, removeSyncItem } from './localDb'
import { saveLocalWithSync } from './syncService'
import { pushRecordViaApi } from './syncApiClient'
import { markRecordFromCloud, recordForPush } from './syncUnsyncedCore'
import { parseTrainerPayRate } from './admin/trainerPayrollCore.js'
import { parseAerobicPayRate } from './admin/aerobicPayrollCore.js'
import {
  normalizeTrainerPayTiersInput,
  resolveTrainerPayTiers,
  trainerPayTiersToRowFields,
} from './admin/trainerPayTiersCore.js'
import {
  filterAerobicSalesTypes,
  filterTrainerAssignableTypes,
  isTrainerAssignableMembershipType,
  normalizeMembershipTypeCode,
  validateMembershipTypeCodeChange,
} from './membershipTypesCore.js'
import {
  buildPendingMembershipTypeKeys,
  shouldApplyRemoteMembershipTypeRow,
  shouldDeleteLocalMembershipTypeRow,
} from './membershipTypesMergeCore.js'

export {
  filterAerobicSalesTypes,
  filterTrainerAssignableTypes,
  findMembershipTypeByCode,
  isAerobicSalesMembershipType,
  isTrainerAssignableMembershipType,
  normalizeMembershipTypeCode,
  validateMembershipTypeCodeChange,
} from './membershipTypesCore.js'


function coerceCountsTowardPayPlanFlag(raw) {
  if (raw === false || raw === 0 || raw === '0') return false
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'false') return false
  return Boolean(raw)
}

function normalizeRow(row) {
  const codeRaw = row.code ?? row.name
  const tiers = resolveTrainerPayTiers(row)
  const aerobicRaw = row.aerobic_pay_amount
  const aerobicParsed = aerobicRaw == null || aerobicRaw === '' ? 0 : parseAerobicPayRate(aerobicRaw)
  const trainerAssignable = row.trainer_assignable !== false
  const hasPlanFlag = Object.prototype.hasOwnProperty.call(row ?? {}, 'counts_toward_pay_plan')
  return {
    ...row,
    code: normalizeMembershipTypeCode(codeRaw),
    club_id: String(row.club_id ?? '').trim(),
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
    trainer_assignable: trainerAssignable,
    ...trainerPayTiersToRowFields(tiers),
    aerobic_pay_amount: Number.isNaN(aerobicParsed) ? 0 : aerobicParsed,
    ...(hasPlanFlag ? { counts_toward_pay_plan: coerceCountsTowardPayPlanFlag(row.counts_toward_pay_plan) } : {}),
  }
}

async function pushTypeOp(operation, row, remoteId) {
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { cloudOk: false, cloudError: 'Нет сети — тип только на этом устройстве. Нажмите Sync позже.' }
  }
  const push = await pushRecordViaApi({
    table_name: 'membership_types',
    operation,
    data: recordForPush(row),
    remote_id: remoteId ?? row.id ?? null,
    local_id: null,
  })
  return push.ok
    ? { cloudOk: true, record: push.record }
    : { cloudOk: false, cloudError: push.error ?? 'Не удалось отправить в облако' }
}

/** @param {string} clubId @param {{ activeOnly?: boolean, trainerAssignableOnly?: boolean, aerobicOnly?: boolean }} [opts] */
export async function listMembershipTypesForClub(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return []
  const db = await getDb()
  const all = await db.getAll('membership_types')
  let list = all.filter((t) => String(t.club_id) === cid)
  if (opts.activeOnly) list = list.filter((t) => t.is_active !== false)
  if (opts.trainerAssignableOnly) list = filterTrainerAssignableTypes(list)
  if (opts.aerobicOnly) list = filterAerobicSalesTypes(list)
  return list.sort(
    (a, b) =>
      (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
      String(a.code ?? '').localeCompare(String(b.code ?? ''), 'ru'),
  )
}

const MEMBERSHIP_TYPES_STORAGE_EVENT = 'fitness-diary-storage'
const lastAutoPullByClub = new Map()
const AUTO_PULL_COOLDOWN_MS = 30_000

export function notifyMembershipTypesChanged(clubId, detail = {}) {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(
      new CustomEvent(MEMBERSHIP_TYPES_STORAGE_EVENT, {
        detail: { reason: 'membership-types', club_id: String(clubId ?? '').trim(), ...detail },
      }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * Локальный кэш + pull с сервера, если типов ещё нет (не ждать ручной Sync).
 * @param {string} clubId
 * @param {{ force?: boolean, activeOnly?: boolean }} [opts]
 */
export async function ensureMembershipTypesForClub(clubId, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { types: [], pulled: false }

  let types = await listMembershipTypesForClub(cid, opts)
  const activeCount = types.filter((t) => t.is_active !== false).length
  const offline =
    !isSupabaseConfigured() || (typeof navigator !== 'undefined' && navigator.onLine === false)

  const lastPull = lastAutoPullByClub.get(cid) ?? 0
  const cooledDown = Date.now() - lastPull >= AUTO_PULL_COOLDOWN_MS
  const needPull = shouldPullMembershipTypes({
    localActiveCount: activeCount,
    force: opts.force === true,
    offline,
  })

  if (!needPull || (!cooledDown && activeCount > 0 && opts.force !== true)) {
    return { types, pulled: false, offline }
  }

  try {
    const { pullMembershipTypesForClubFromCloud } = await import('./pullReferenceData.js')
    const result = await pullMembershipTypesForClubFromCloud(
      cid,
      opts.forceFromCloud === true ? { forceFromCloud: true } : {},
    )
    lastAutoPullByClub.set(cid, Date.now())
    if (result?.ok) {
      types = await listMembershipTypesForClub(cid, opts)
      notifyMembershipTypesChanged(cid, { count: result.count ?? types.length })
      return { types, pulled: true, count: result.count ?? types.length }
    }
    return {
      types,
      pulled: false,
      offline,
      error: result?.error ?? result?.reason ?? 'Не удалось загрузить типы абонементов',
    }
  } catch (e) {
    return {
      types,
      pulled: false,
      offline,
      error: String(e?.message ?? e ?? 'Ошибка загрузки типов'),
    }
  }
}

/** @param {string} clubId @param {object[]} types */
export function clearMembershipTypesAutoPullCooldownForTests(clubId, types = []) {
  if (clubId) lastAutoPullByClub.delete(String(clubId))
  else lastAutoPullByClub.clear()
  void types
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
export async function insertMembershipType({
  club_id,
  code,
  sort_order = 0,
  trainer_assignable = true,
}) {
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
    trainer_assignable: trainer_assignable !== false,
    trainer_pay_per_session: 0,
    trainer_pay_l1: 0,
    trainer_pay_l2: 0,
    trainer_pay_l3: 0,
    aerobic_pay_amount: 0,
    counts_toward_pay_plan: false,
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

/**
 * Переименовать тип карты (поле code). Абонементы держат membership_type_id — не отвязываются.
 * Уникальность code в клубе — как у unique index (без учёта регистра).
 * @param {string} id
 * @param {string} newCode
 * @returns {Promise<{ cloudOk: boolean, cloudError?: string, unchanged?: boolean, saved?: boolean }>}
 */
export async function updateMembershipTypeCode(id, newCode) {
  const tid = String(id ?? '').trim()
  if (!tid) return { cloudOk: false, cloudError: 'Нет id типа', saved: false }

  const db = await getDb()
  const prev = await db.get('membership_types', tid)
  if (!prev) return { cloudOk: false, cloudError: 'Тип не найден', saved: false }

  const clubId = String(prev.club_id ?? '').trim()
  const clubTypes = clubId ? await listMembershipTypesForClub(clubId) : []
  const validated = validateMembershipTypeCodeChange({
    nextCode: newCode,
    previousCode: prev.code,
    existingTypes: clubTypes,
    excludeId: tid,
  })
  if (!validated.ok) {
    return { cloudOk: false, cloudError: validated.error, saved: false }
  }
  if (validated.unchanged) {
    return { cloudOk: true, unchanged: true, saved: false }
  }

  const row = normalizeRow({ ...prev, code: validated.code })
  await saveLocalWithSync('membership_types', row, {
    table_name: 'membership_types',
    operation: 'update',
    remote_id: tid,
  })
  const push = await pushTypeOp('update', row, tid)
  if (clubId) {
    notifyMembershipTypesChanged(clubId, { reason: 'rename-code', id: tid, code: validated.code })
  }
  return { ...push, saved: true }
}

/** @param {string} id @param {string|number|{ l1?: unknown, l2?: unknown, l3?: unknown }} rawPayOrTiers */
export async function updateMembershipTypePay(id, rawPayOrTiers) {
  const tid = String(id ?? '').trim()
  if (!tid) return { cloudOk: false, cloudError: 'Нет id типа' }

  const db = await getDb()
  const prev = await db.get('membership_types', tid)
  if (!prev) return { cloudOk: false, cloudError: 'Тип не найден' }
  if (!isTrainerAssignableMembershipType(prev)) {
    return { cloudOk: false, cloudError: 'Тип относится к АЗ — меняйте стоимость в разделе аэробного зала' }
  }

  let tiers
  if (rawPayOrTiers != null && typeof rawPayOrTiers === 'object' && !Array.isArray(rawPayOrTiers)) {
    const parsed = normalizeTrainerPayTiersInput(rawPayOrTiers)
    if (!parsed.ok) return { cloudOk: false, cloudError: parsed.error }
    tiers = { l1: parsed.l1, l2: parsed.l2, l3: parsed.l3 }
  } else {
    const pay = parseTrainerPayRate(rawPayOrTiers)
    if (Number.isNaN(pay)) {
      return { cloudOk: false, cloudError: 'Оплата: неотрицательное число' }
    }
    // Старый вызов с одной ставкой — все три уровня одинаковые (миграция UI).
    tiers = { l1: pay, l2: pay, l3: pay }
  }

  const row = normalizeRow({ ...prev, ...trainerPayTiersToRowFields(tiers) })
  await saveLocalWithSync('membership_types', row, {
    table_name: 'membership_types',
    operation: 'update',
    remote_id: tid,
  })
  return pushTypeOp('update', row, tid)
}

/**
 * Галочка «В план» — участие типа в порогах плана ЗП (независимо от ставок ₽).
 * @param {string} id
 * @param {boolean} countsTowardPayPlan
 */
export async function updateMembershipTypeCountsTowardPayPlan(id, countsTowardPayPlan) {
  const tid = String(id ?? '').trim()
  if (!tid) return { cloudOk: false, cloudError: 'Нет id типа' }

  const db = await getDb()
  const prev = await db.get('membership_types', tid)
  if (!prev) return { cloudOk: false, cloudError: 'Тип не найден' }
  if (!isTrainerAssignableMembershipType(prev)) {
    return { cloudOk: false, cloudError: 'Галочка «В план» только для типов ПЗ' }
  }

  const row = normalizeRow({
    ...prev,
    counts_toward_pay_plan: countsTowardPayPlan === true,
  })
  await saveLocalWithSync('membership_types', row, {
    table_name: 'membership_types',
    operation: 'update',
    remote_id: tid,
  })
  return pushTypeOp('update', row, tid)
}

/** @param {string} id @param {string|number} rawPay */
export async function updateAerobicMembershipPay(id, rawPay) {
  const tid = String(id ?? '').trim()
  if (!tid) return { cloudOk: false, cloudError: 'Нет id типа' }
  const pay = parseAerobicPayRate(rawPay)
  if (Number.isNaN(pay)) {
    return { cloudOk: false, cloudError: 'Стоимость: неотрицательное число' }
  }

  const db = await getDb()
  const prev = await db.get('membership_types', tid)
  if (!prev) return { cloudOk: false, cloudError: 'Тип не найден' }
  if (isTrainerAssignableMembershipType(prev)) {
    return { cloudOk: false, cloudError: 'Тип не относится к аэробному залу' }
  }

  const row = normalizeRow({ ...prev, aerobic_pay_amount: pay })
  await saveLocalWithSync('membership_types', row, {
    table_name: 'membership_types',
    operation: 'update',
    remote_id: tid,
  })
  return pushTypeOp('update', row, tid)
}

/** @returns {Promise<{ cloudOk: boolean, cloudError?: string }>} */
export async function insertAerobicMembershipType({ club_id, code, sort_order = 0 }) {
  return insertMembershipType({
    club_id,
    code,
    sort_order,
    trainer_assignable: false,
  })
}

/** @param {Set<string>} remoteIds */
async function clearMembershipTypesSyncQueueForRemoteIds(remoteIds) {
  if (!remoteIds?.size) return 0
  let cleared = 0
  for (const item of await listSyncQueue()) {
    if (item.table_name !== 'membership_types') continue
    if (item.operation !== 'insert' && item.operation !== 'update') continue
    const id = String(item.remote_id ?? item.data?.id ?? '').trim()
    if (!id || !remoteIds.has(id)) continue
    await removeSyncItem(item.local_id)
    cleared++
  }
  return cleared
}

/** @param {string} clubId @param {object[]} remoteRows @param {{ forceFromCloud?: boolean }} [opts] */
export async function mergeMembershipTypesForClub(clubId, remoteRows, opts = {}) {
  const cid = String(clubId ?? '').trim()
  if (!cid) return { count: 0 }
  const forceFromCloud = opts.forceFromCloud === true
  const queueItems = await listSyncQueue()
  const { pendingUpdates, pendingInserts } = buildPendingMembershipTypeKeys(queueItems)

  const remoteIds = new Set()
  for (const row of remoteRows ?? []) {
    const id = String(row?.id ?? '').trim()
    if (!id || String(row.club_id) !== cid) continue
    remoteIds.add(id)
    if (
      !shouldApplyRemoteMembershipTypeRow({
        id,
        forceFromCloud,
        pendingUpdates,
        pendingInserts,
      })
    ) {
      continue
    }
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
    if (
      !shouldDeleteLocalMembershipTypeRow({
        id,
        remoteIds,
        forceFromCloud,
        pendingUpdates,
        pendingInserts,
      })
    ) {
      continue
    }
    await db.delete('membership_types', id)
  }

  if (forceFromCloud && remoteIds.size > 0) {
    await clearMembershipTypesSyncQueueForRemoteIds(remoteIds)
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

export { shouldPullMembershipTypes } from './membershipTypesPullCore.js'
