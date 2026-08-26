/**
 * Локальные клип-карты на планшете тренера (после trainer-pull).
 */
import { getDb } from '../localDb.js'
import { saveLocalWithSync } from '../syncService.js'
import {
  canMarkSaleClipDone,
  findMembershipFulfillingSaleClip,
  membershipFieldsFromSaleClip,
  normalizeSaleClipStatus,
} from './saleClipCore.js'
import {
  findLinkedMembershipForAwaitingClip,
  isAwaitingSaleClipSupersededByMembership,
} from './saleClipPullPruneCore.js'
import { todayLocalIso } from '../dateRu.js'
import {
  normalizeMembershipTotalTrainings,
  shouldConfirmSuspiciousLowTotal,
} from '../membership/membershipTotalGuardCore.js'

/**
 * @param {string} trainerId
 * @returns {Promise<object[]>}
 */
export async function listAwaitingSaleClipsForTrainer(trainerId) {
  const tid = String(trainerId ?? '').trim()
  if (!tid) return []
  const db = await getDb()
  let rows = []
  try {
    if (db.objectStoreNames.contains('sale_clips')) {
      rows = await db.getAllFromIndex('sale_clips', 'by_trainer_id', tid)
    }
  } catch {
    rows = []
  }
  const awaiting = (rows ?? []).filter((c) => normalizeSaleClipStatus(c?.status) === 'awaiting')
  /** @type {Record<string, object[]>} */
  const membershipsByClientId = {}
  for (const c of awaiting) {
    const cid = String(c?.client_id ?? '').trim()
    if (!cid || membershipsByClientId[cid]) continue
    try {
      membershipsByClientId[cid] = await db.getAllFromIndex('memberships', 'by_client_id', cid)
    } catch {
      membershipsByClientId[cid] = []
    }
  }
  return awaiting
    .filter((c) => {
      const cid = String(c?.client_id ?? '').trim()
      const mems = membershipsByClientId[cid] ?? []
      if (findLinkedMembershipForAwaitingClip(c, mems)) return false
      if (isAwaitingSaleClipSupersededByMembership(c, mems)) return false
      return true
    })
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
}

/**
 * @param {string} clientId
 */
export async function listAwaitingSaleClipsForClient(clientId) {
  const cid = String(clientId ?? '').trim()
  if (!cid) return []
  const db = await getDb()
  let rows = []
  try {
    if (db.objectStoreNames.contains('sale_clips')) {
      rows = await db.getAllFromIndex('sale_clips', 'by_client_id', cid)
    }
  } catch {
    rows = []
  }
  return (rows ?? []).filter((c) => normalizeSaleClipStatus(c?.status) === 'awaiting')
}

/**
 * Создать абонемент по клипу и закрыть заявку (идемпотентно).
 * @param {{ clip: object, clientId: string, clubId: string }} input
 */
export async function createMembershipFromSaleClip(input) {
  const clip = input.clip
  const clientId = String(input.clientId ?? clip?.client_id ?? '').trim()
  const clubId = String(input.clubId ?? clip?.club_id ?? '').trim()
  if (!clip?.id) return { ok: false, reason: 'Нет клипа' }
  if (!clientId) return { ok: false, reason: 'Нет клиента для абонемента' }
  if (!clubId) return { ok: false, reason: 'Нет клуба' }

  const gate = canMarkSaleClipDone(clip, clip.membership_id || 'pending')
  if (normalizeSaleClipStatus(clip.status) === 'done' && clip.membership_id) {
    return { ok: true, reason: gate.reason || 'Уже подтверждено', membershipId: clip.membership_id, already: true }
  }
  if (normalizeSaleClipStatus(clip.status) === 'cancelled') {
    return { ok: false, reason: 'Клип отменён' }
  }

  const fields = membershipFieldsFromSaleClip(clip)
  if (fields.total_trainings == null || !(Number(fields.total_trainings) > 0)) {
    return {
      ok: false,
      reason:
        'В заявке не указано число занятий — попросите менеджера исправить клип. Иначе получится абон 0/0.',
    }
  }
  const totalTrainings = normalizeMembershipTotalTrainings(fields.total_trainings)

  try {
    const db = await getDb()
    let mems = []
    if (db.objectStoreNames.contains('memberships')) {
      mems = await db.getAllFromIndex('memberships', 'by_client_id', clientId)
    }
    const existing = findMembershipFulfillingSaleClip(clip, mems)
    if (existing?.id) {
      const now = new Date().toISOString()
      const mid = String(existing.id)
      const patched = { ...existing, clip_id: String(clip.id), updated_at: now }
      await saveLocalWithSync('memberships', patched, {
        table_name: 'memberships',
        operation: 'update',
        remote_id: mid,
      })
      const clipNext = {
        ...clip,
        status: 'done',
        membership_id: mid,
        client_id: clientId,
        done_at: now,
        updated_at: now,
      }
      await saveLocalWithSync('sale_clips', clipNext, {
        table_name: 'sale_clips',
        operation: 'update',
        remote_id: clip.id,
      })
      return {
        ok: true,
        reason: 'Абон по этой продаже уже был — заявку закрыли без дубля',
        membershipId: mid,
        already: true,
      }
    }
  } catch (e) {
    console.warn('[saleClip] existing membership check', e?.message ?? e)
  }

  if (
    shouldConfirmSuspiciousLowTotal({ totalTrainings, isPnkTrialType: false }) &&
    !input.confirmedLowTotal
  ) {
    return {
      ok: false,
      code: 'confirm_low_total',
      reason: `В заявке всего ${totalTrainings} заняти${totalTrainings === 1 ? 'е' : 'я'}. Подтвердите создание или попросите менеджера исправить клип.`,
      totalTrainings,
    }
  }
  const membershipId = crypto.randomUUID()
  const now = new Date().toISOString()
  const row = {
    id: membershipId,
    client_id: clientId,
    club_id: clubId,
    start_date: fields.start_date,
    end_date: fields.end_date,
    total_trainings: totalTrainings,
    used_trainings: 0,
    membership_type_id: fields.membership_type_id || null,
    clip_id: String(clip.id),
    hall: 'pz',
    created_at: now,
    updated_at: now,
  }

  await saveLocalWithSync('memberships', row, {
    table_name: 'memberships',
    operation: 'insert',
    remote_id: null,
  })

  try {
    const { ensureOpenHallAfterMembershipSave } = await import('../clientHallLifecycleSyncService.js')
    await ensureOpenHallAfterMembershipSave(clientId, 'pz')
  } catch (e) {
    console.warn('[saleClip] ensure open hall', e?.message ?? e)
  }

  const doneGate = canMarkSaleClipDone(clip, membershipId)
  if (!doneGate.ok && !doneGate.already) {
    return { ok: false, reason: doneGate.reason }
  }

  const clipNext = {
    ...clip,
    status: 'done',
    membership_id: membershipId,
    client_id: clientId,
    done_at: now,
    updated_at: now,
  }
  await saveLocalWithSync('sale_clips', clipNext, {
    table_name: 'sale_clips',
    operation: 'update',
    remote_id: clip.id,
  })

  return {
    ok: true,
    reason: 'Подтверждено планшетом — абонемент создан по клипу',
    membershipId,
    already: false,
  }
}

/**
 * Часы ожидания для UI.
 * @param {object} clip
 * @param {string} [asOfIso]
 */
export function saleClipAwaitingHours(clip, asOfIso = new Date().toISOString()) {
  const created = Date.parse(String(clip?.created_at ?? ''))
  const asOf = Date.parse(String(asOfIso))
  if (!Number.isFinite(created) || !Number.isFinite(asOf)) return 0
  return Math.max(0, Math.floor((asOf - created) / 3600000))
}

export { todayLocalIso }
