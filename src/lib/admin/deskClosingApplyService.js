/**
 * Применение плана desk-сида (create + проставление desk_hall).
 * Desk-клиент: trainer_id = null, зал в desk_hall.
 */

import { getLocalClient } from '../dataAccess.js'
import { listClientsByClubId } from '../localDbClubQuery.js'
import { saveLocalWithSync } from '../syncService.js'
import { resolveDeskMembershipDates } from './deskMembershipLedgerCore.js'
import {
  assertClubCardAvailableForCreate,
  normalizeSalesCardNumber,
} from './salesClientMatchCore.js'

/**
 * @param {{
 *   actions: Array<{ action: string, cardNumber: string, name: string, phone?: string, endDate?: string|null, startDate?: string|null, packageMonths?: number|null, typeName?: string, paidAmount?: number|null, hall?: string|null, clientId?: string|null }>,
 *   clubId: string,
 *   membershipTypeId?: string|null,
 *   defaultHall?: 'tz'|'az'|null,
 *   clients?: object[]|null,
 * }} input
 */
export async function applyDeskClosingCreates(input) {
  const clubId = String(input.clubId ?? '')
  const defaultHall =
    input.defaultHall === 'tz' || input.defaultHall === 'az' ? input.defaultHall : null
  if (!clubId) return { ok: false, error: 'Нет клуба' }

  let created = 0
  let tagged = 0
  const errors = []
  /** @type {Set<string>} */
  const createdCards = new Set()

  /** @type {object[]} */
  let clubClients =
    Array.isArray(input.clients) && input.clients.length
      ? [...input.clients]
      : await listClientsByClubId(clubId)

  for (const a of input.actions ?? []) {
    if (a.action === 'tag_hall') {
      const cid = String(a.clientId ?? '').trim()
      const hall = a.hall === 'tz' || a.hall === 'az' ? a.hall : defaultHall
      if (!cid || !hall) {
        errors.push(`${a.cardNumber}: нет клиента или зала для метки`)
        continue
      }
      try {
        const prev = await getLocalClient(cid)
        if (!prev) {
          errors.push(`${a.cardNumber}: клиент не найден локально`)
          continue
        }
        await saveLocalWithSync(
          'clients',
          {
            ...prev,
            desk_hall: hall,
            trainer_id: null,
          },
          {
            table_name: 'clients',
            operation: 'update',
            remote_id: cid,
          },
        )
        tagged += 1
      } catch (e) {
        errors.push(`${a.cardNumber}: ${e?.message || 'ошибка метки зала'}`)
      }
      continue
    }

    if (a.action !== 'create') continue
    const cardNorm = normalizeSalesCardNumber(a.cardNumber)
    if (cardNorm && createdCards.has(cardNorm)) {
      continue
    }
    const cardCheck = assertClubCardAvailableForCreate(clubClients, clubId, a.cardNumber)
    if (!cardCheck.ok) {
      errors.push(cardCheck.error)
      continue
    }
    const dates = resolveDeskMembershipDates(a.endDate, a.startDate, a.packageMonths)
    if (!dates) {
      errors.push(`${a.cardNumber}: нет даты окончания`)
      continue
    }
    const hall = a.hall === 'tz' || a.hall === 'az' ? a.hall : defaultHall
    if (!hall) {
      errors.push(`${a.cardNumber}: нет зала ТЗ/АЗ — карточку не создаём`)
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
      trainer_id: null,
      lifecycle: 'active',
      desk_hall: hall,
      created_at: now,
    }
    try {
      await saveLocalWithSync('clients', client, {
        table_name: 'clients',
        operation: 'insert',
        remote_id: null,
      })
      const paid =
        a.paidAmount != null && Number.isFinite(Number(a.paidAmount)) && Number(a.paidAmount) >= 0
          ? Math.round(Number(a.paidAmount) * 100) / 100
          : null
      const membership = {
        id: crypto.randomUUID(),
        client_id: clientId,
        club_id: clubId,
        start_date: dates.start_date,
        end_date: dates.end_date,
        total_trainings: 0,
        used_trainings: 0,
        membership_type_id: input.membershipTypeId || null,
        paid_amount: paid,
        created_at: now,
      }
      await saveLocalWithSync('memberships', membership, {
        table_name: 'memberships',
        operation: 'insert',
        remote_id: null,
      })
      created += 1
      if (cardNorm) createdCards.add(cardNorm)
      clubClients = [...clubClients, client]
    } catch (e) {
      errors.push(`${a.cardNumber}: ${e?.message || 'ошибка сохранения'}`)
    }
  }

  return { ok: errors.length === 0, created, tagged, errors }
}
