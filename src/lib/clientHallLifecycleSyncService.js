/**
 * Офлайн-first: закрыть / открыть направление, уйти из клуба.
 */
import { getDb } from './localDb.js'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  saveLocalWithSync,
} from './syncService.js'
import {
  CLIENT_HALL_LIFECYCLE_TABLE,
  hasLiveMembershipForHall,
  planCloseHall,
  planEnsureOpenHallAfterMembership,
  planLeaveClub,
  planReopenHall,
} from './clientHallLifecycleCore.js'
import { MEMBERSHIP_HALLS } from './membershipHallCore.js'
import { buildArchiveRestoreFields } from './clientArchiveReasonCore.js'
import { todayLocalIso } from './dateRu.js'
import { notifyClientHallLifecycleChanged, notifyAdminClientsBrowseStorageChanged } from './admin/adminClientsListReloadCore.js'
import { clearTrainerWorkspaceSnapshotSync } from './trainerWorkspaceCache.js'

async function loadClientBundle(clientId) {
  const db = await getDb()
  const client = await db.get('clients', clientId)
  if (!client?.id) {
    throw new Error('Клиент не найден в локальном кэше. Обновите список (Sync) и повторите.')
  }
  let memberships = []
  try {
    memberships = await db.getAllFromIndex('memberships', 'by_client_id', clientId)
  } catch {
    const all = await db.getAll('memberships')
    memberships = (all ?? []).filter((m) => String(m?.client_id) === String(clientId))
  }
  let lifecycleRows = []
  try {
    if (db.objectStoreNames.contains('client_hall_lifecycle')) {
      lifecycleRows = await db.getAllFromIndex('client_hall_lifecycle', 'by_client_id', clientId)
    }
  } catch {
    try {
      const all = await db.getAll('client_hall_lifecycle')
      lifecycleRows = (all ?? []).filter((r) => String(r?.client_id) === String(clientId))
    } catch {
      lifecycleRows = []
    }
  }
  return { client, memberships: memberships ?? [], lifecycleRows: lifecycleRows ?? [] }
}

/**
 * @param {object} clientRow
 * @param {string|{ reason?: string, expectedReturnOn?: string|null }} reasonInput
 * @param {{ hall?: string }} [opts]
 */
export async function closeClientHallWithReason(clientRow, reasonInput, opts = {}) {
  const hall = opts.hall ?? 'pz'
  const { client, memberships, lifecycleRows } = await loadClientBundle(clientRow.id)
  const plan = planCloseHall({
    client,
    hall,
    reasonInput,
    memberships,
    lifecycleRows,
    asOf: todayLocalIso(),
  })
  if (!plan.ok) throw new Error(plan.error)
  return persistClosePlan(plan, client.id)
}

async function persistClosePlan(plan, clientId) {
  for (const m of plan.membershipPatches ?? []) {
    await saveLocalWithSync('memberships', m, {
      table_name: 'memberships',
      operation: 'update',
      remote_id: m.id,
    })
  }
  const lifeRows = [plan.lifecycleRow, ...(plan.autoLifecycleRows ?? [])].filter(Boolean)
  for (const row of lifeRows) {
    const db = await getDb()
    let op = 'insert'
    try {
      const cur = await db.get('client_hall_lifecycle', row.id)
      if (cur) op = 'update'
    } catch {
      op = 'insert'
    }
    await saveLocalWithSync('client_hall_lifecycle', row, {
      table_name: CLIENT_HALL_LIFECYCLE_TABLE,
      operation: op,
      remote_id: row.id,
    })
  }
  let clientOut = null
  if (plan.clientPatch) {
    const db = await getDb()
    const base = await db.get('clients', clientId)
    if (base?.id) {
      clientOut = { ...base, ...plan.clientPatch }
      await saveLocalWithSync('clients', clientOut, {
        table_name: 'clients',
        operation: 'update',
        remote_id: base.id,
      })
    }
  }
  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, 'Закрытие направления')
  clearTrainerWorkspaceSnapshotSync()
  notifyClientHallLifecycleChanged(clientId, { clubId: clientOut?.club_id ?? plan.clientPatch?.club_id })
  return { row: clientOut, warn, plan }
}

/**
 * @param {object} clientRow
 * @param {{ hall?: string }} [opts]
 */
export async function reopenClientHall(clientRow, opts = {}) {
  const hall = opts.hall ?? 'pz'
  const { client, memberships, lifecycleRows } = await loadClientBundle(clientRow.id)
  const plan = planReopenHall({
    client,
    hall,
    memberships,
    lifecycleRows,
    asOf: todayLocalIso(),
  })
  if (!plan.ok) throw new Error(plan.error)
  const db = await getDb()
  let op = 'insert'
  try {
    const cur = await db.get('client_hall_lifecycle', plan.lifecycleRow.id)
    if (cur) op = 'update'
  } catch {
    op = 'insert'
  }
  await saveLocalWithSync('client_hall_lifecycle', plan.lifecycleRow, {
    table_name: CLIENT_HALL_LIFECYCLE_TABLE,
    operation: op,
    remote_id: plan.lifecycleRow.id,
  })
  let clientOut = null
  if (plan.clientPatch) {
    const base = await db.get('clients', client.id)
    if (base?.id) {
      clientOut = { ...base, ...plan.clientPatch }
      await saveLocalWithSync('clients', clientOut, {
        table_name: 'clients',
        operation: 'update',
        remote_id: base.id,
      })
    }
  }
  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, 'Открытие направления')
  clearTrainerWorkspaceSnapshotSync()
  notifyClientHallLifecycleChanged(client.id, { clubId: clientOut?.club_id ?? client.club_id })
  return { row: clientOut, warn, plan }
}

/**
 * @param {object} clientRow
 * @param {string|{ reason?: string, expectedReturnOn?: string|null }} reasonInput
 */
export async function leaveClubWithReason(clientRow, reasonInput) {
  const { client, memberships, lifecycleRows } = await loadClientBundle(clientRow.id)
  const plan = planLeaveClub({
    client,
    reasonInput,
    memberships,
    lifecycleRows,
    asOf: todayLocalIso(),
  })
  if (!plan.ok) throw new Error(plan.error)
  for (const m of plan.membershipPatches ?? []) {
    await saveLocalWithSync('memberships', m, {
      table_name: 'memberships',
      operation: 'update',
      remote_id: m.id,
    })
  }
  for (const row of plan.lifecycleRows ?? []) {
    const db = await getDb()
    let op = 'insert'
    try {
      const cur = await db.get('client_hall_lifecycle', row.id)
      if (cur) op = 'update'
    } catch {
      op = 'insert'
    }
    await saveLocalWithSync('client_hall_lifecycle', row, {
      table_name: CLIENT_HALL_LIFECYCLE_TABLE,
      operation: op,
      remote_id: row.id,
    })
  }
  const db = await getDb()
  const base = await db.get('clients', client.id)
  const clientOut = { ...base, ...plan.clientPatch }
  await saveLocalWithSync('clients', clientOut, {
    table_name: 'clients',
    operation: 'update',
    remote_id: base.id,
  })
  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, 'Уход из клуба')
  clearTrainerWorkspaceSnapshotSync()
  notifyClientHallLifecycleChanged(client.id, { clubId: clientOut?.club_id ?? client.club_id })
  return { row: clientOut, warn, plan }
}

/**
 * После insert/update живого абона: открыть зал в lifecycle и вытащить из архива клуба.
 * @param {string} clientId
 * @param {string} hall
 */
export async function ensureOpenHallAfterMembershipSave(clientId, hall) {
  const id = String(clientId ?? '').trim()
  if (!id) return { ok: true, skipped: true, reason: 'no_client' }
  const { client, memberships, lifecycleRows } = await loadClientBundle(id)
  const plan = planEnsureOpenHallAfterMembership({
    client,
    hall,
    memberships,
    lifecycleRows,
    asOf: todayLocalIso(),
  })
  if (!plan.ok) throw new Error(plan.error || 'Не удалось открыть направление')
  if (plan.skipped) return { ok: true, skipped: true, reason: plan.reason, plan }

  if (plan.lifecycleRow) {
    const db = await getDb()
    let op = 'insert'
    try {
      const cur = await db.get('client_hall_lifecycle', plan.lifecycleRow.id)
      if (cur) op = 'update'
    } catch {
      op = 'insert'
    }
    await saveLocalWithSync('client_hall_lifecycle', plan.lifecycleRow, {
      table_name: CLIENT_HALL_LIFECYCLE_TABLE,
      operation: op,
      remote_id: plan.lifecycleRow.id,
    })
  }

  let clientOut = null
  if (plan.clientPatch) {
    const db = await getDb()
    const base = await db.get('clients', id)
    if (base?.id) {
      clientOut = { ...base, ...plan.clientPatch }
      await saveLocalWithSync('clients', clientOut, {
        table_name: 'clients',
        operation: 'update',
        remote_id: base.id,
      })
    }
  }

  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, 'Возврат из архива после абона')
  notifyClientHallLifecycleChanged(id, { clubId: clientOut?.club_id ?? client.club_id })
  return { ok: true, skipped: false, row: clientOut, warn, plan }
}

/**
 * «Вернуть в клуб»: снять archived_at и открыть залы, где есть живой/ожидающий абон.
 * Иначе closed_at остаётся — карточка «в клубе», а направление всё ещё закрыто.
 * @param {object} clientRow
 */
export async function restoreClientFromClubArchive(clientRow) {
  const id = String(clientRow?.id ?? '').trim()
  if (!id) throw new Error('Клиент не найден')
  const { client, memberships } = await loadClientBundle(id)
  let clientOut = client
  let warn = null

  if (client.archived_at) {
    const patch = buildArchiveRestoreFields()
    clientOut = { ...client, ...patch }
    await saveLocalWithSync('clients', clientOut, {
      table_name: 'clients',
      operation: 'update',
      remote_id: id,
    })
  }

  const asOf = todayLocalIso()
  const halls = MEMBERSHIP_HALLS.filter((h) =>
    hasLiveMembershipForHall(memberships, h, asOf, clientOut),
  )
  for (const hall of halls) {
    try {
      const res = await ensureOpenHallAfterMembershipSave(id, hall)
      if (res?.warn) warn = res.warn
      if (res?.row) clientOut = res.row
    } catch (e) {
      console.warn('[lifecycle] restore ensure', hall, e?.message ?? e)
    }
  }

  const flush = await flushCriticalWritesToCloud()
  const flushWarn = criticalWriteCloudWarning(flush, 'Возврат из архива')
  const clubId = clientOut?.club_id ?? client.club_id
  if (client.archived_at) {
    notifyAdminClientsBrowseStorageChanged({ reason: 'client-archive-changed', clientId: id, clubId })
  }
  return { row: clientOut, warn: warn || flushWarn, hallsOpened: halls }
}

/** @deprecated use closeClientHallWithReason — совместимость кнопки архива */
export async function archiveClientWithReasonViaHall(clientRow, reasonInput) {
  return closeClientHallWithReason(clientRow, reasonInput, { hall: 'pz' })
}
