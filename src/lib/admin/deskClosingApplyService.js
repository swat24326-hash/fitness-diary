/**
 * Применение плана desk-сида (create only).
 */

import { saveLocalWithSync } from '../syncService.js'
import { HOLDING_TRAINER_DISPLAY_NAME } from './deskClosingImportCore.js'

/**
 * @param {string} endIso
 * @param {string|null} startIso
 */
export function resolveDeskMembershipDates(endIso, startIso) {
  const end = String(endIso ?? '').slice(0, 10)
  let start = String(startIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const d = new Date(`${end}T12:00:00`)
    d.setDate(d.getDate() - 30)
    start = d.toISOString().slice(0, 10)
  }
  return { start_date: start, end_date: end }
}

/**
 * @param {{
 *   actions: Array<{ action: string, cardNumber: string, name: string, phone?: string, endDate?: string|null, startDate?: string|null, typeName?: string }>,
 *   clubId: string,
 *   holdingTrainerId: string,
 *   membershipTypeId?: string|null,
 * }} input
 */
export async function applyDeskClosingCreates(input) {
  const clubId = String(input.clubId ?? '')
  const holdingTrainerId = String(input.holdingTrainerId ?? '')
  if (!clubId) return { ok: false, error: 'Нет клуба' }
  if (!holdingTrainerId) {
    return { ok: false, error: `Укажите тренера «${HOLDING_TRAINER_DISPLAY_NAME}»` }
  }

  let created = 0
  const errors = []

  for (const a of input.actions ?? []) {
    if (a.action !== 'create') continue
    const dates = resolveDeskMembershipDates(a.endDate, a.startDate)
    if (!dates) {
      errors.push(`${a.cardNumber}: нет даты окончания`)
      continue
    }
    const clientId = crypto.randomUUID()
    const now = new Date().toISOString()
    const client = {
      id: clientId,
      name: String(a.name || `Клиент ${a.cardNumber}`).trim(),
      phone: a.phone ? String(a.phone).trim() : null,
      card_number: String(a.cardNumber),
      club_id: clubId,
      trainer_id: holdingTrainerId,
      lifecycle: 'active',
      created_at: now,
      updated_at: now,
    }
    try {
      await saveLocalWithSync('clients', client, {
        table_name: 'clients',
        operation: 'insert',
        remote_id: null,
      })
      const membership = {
        id: crypto.randomUUID(),
        client_id: clientId,
        club_id: clubId,
        start_date: dates.start_date,
        end_date: dates.end_date,
        total_trainings: 0,
        used_trainings: 0,
        membership_type_id: input.membershipTypeId || null,
        created_at: now,
        updated_at: now,
      }
      await saveLocalWithSync('memberships', membership, {
        table_name: 'memberships',
        operation: 'insert',
        remote_id: null,
      })
      created += 1
    } catch (e) {
      errors.push(`${a.cardNumber}: ${e?.message || 'ошибка сохранения'}`)
    }
  }

  return { ok: errors.length === 0, created, errors }
}
