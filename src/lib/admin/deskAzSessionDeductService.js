/**
 * Persist списаний desk АЗ (memberships + flush).
 */

import { getDb } from '../localDb.js'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  saveLocalWithSync,
} from '../syncService.js'
import { dispatchLocalDataChanged } from '../dataAccess.js'
import {
  applyDeskAzSessionDeduct,
  applyDeskAzSessionVisitDateChange,
  applyDeskAzSessionVisitRemove,
} from './deskAzSessionDeductCore.js'

async function persistMembership(next, reason) {
  await saveLocalWithSync('memberships', next, {
    table_name: 'memberships',
    operation: 'update',
    remote_id: next.id,
  })
  const flush = await flushCriticalWritesToCloud()
  const warning = criticalWriteCloudWarning(flush, 'Списание АЗ')
  dispatchLocalDataChanged({ reason, membershipId: next.id, clientId: next.client_id })
  return { ok: true, membership: next, warning: warning || null }
}

/**
 * @param {{ membershipId: string, date?: string }} input
 */
export async function deductDeskAzSession(input) {
  const id = String(input?.membershipId ?? '').trim()
  if (!id) return { ok: false, error: 'Нет абонемента' }
  const db = await getDb()
  const fresh = await db.get('memberships', id)
  if (!fresh) return { ok: false, error: 'Абонемент не найден в кэше' }
  const applied = applyDeskAzSessionDeduct(fresh, { date: input.date })
  if (!applied.ok) return applied
  return persistMembership(applied.membership, 'desk-az-session-deduct')
}

/**
 * @param {{ membershipId: string, visitId: string, date: string }} input
 */
export async function changeDeskAzSessionVisitDate(input) {
  const id = String(input?.membershipId ?? '').trim()
  if (!id) return { ok: false, error: 'Нет абонемента' }
  const db = await getDb()
  const fresh = await db.get('memberships', id)
  if (!fresh) return { ok: false, error: 'Абонемент не найден в кэше' }
  const applied = applyDeskAzSessionVisitDateChange(fresh, input.visitId, input.date)
  if (!applied.ok) return applied
  return persistMembership(applied.membership, 'desk-az-session-date')
}

/**
 * @param {{ membershipId: string, visitId: string }} input
 */
export async function removeDeskAzSessionVisit(input) {
  const id = String(input?.membershipId ?? '').trim()
  if (!id) return { ok: false, error: 'Нет абонемента' }
  const db = await getDb()
  const fresh = await db.get('memberships', id)
  if (!fresh) return { ok: false, error: 'Абонемент не найден в кэше' }
  const applied = applyDeskAzSessionVisitRemove(fresh, input.visitId)
  if (!applied.ok) return applied
  return persistMembership(applied.membership, 'desk-az-session-remove')
}
