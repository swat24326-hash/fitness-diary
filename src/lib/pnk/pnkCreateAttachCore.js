/**
 * Создание ПНК: attach к существующей карточке по карте/телефону, не второй clients.
 */

import { formatClientName } from '../clientNameFormat.js'
import {
  matchClientByCardThenPhone,
  normalizeSalesCardNumber,
} from '../admin/salesClientMatchCore.js'
import { mergeNewPnkOntoClient, pickClientPnkFields } from './pnkClientFields.js'

/**
 * @param {{
 *   clients?: object[],
 *   phone?: string|null,
 *   cardNumber?: string|null,
 * }} input
 * @returns {{ action: 'create' } | { action: 'attach', client: object, matchedBy: string|null } | { action: 'conflict', error: string }}
 */
export function resolvePnkCreateAttachTarget(input) {
  const match = matchClientByCardThenPhone({
    clients: input?.clients ?? [],
    phone: input?.phone,
    cardNumber: input?.cardNumber,
    preferOperational: true,
  })
  if (match.status === 'conflict') {
    return {
      action: 'conflict',
      error: match.reason || 'Несколько клиентов с таким телефоном или картой — уточните данные',
    }
  }
  if (match.status === 'one' && match.client?.id) {
    return { action: 'attach', client: match.client, matchedBy: match.matchedBy ?? null }
  }
  return { action: 'create' }
}

/**
 * Патч существующего client под ПНК (без второго clients).
 * @param {object} existing
 * @param {{
 *   name?: string,
 *   phone?: string|null,
 *   cardNumber?: string|null,
 *   trainerId: string,
 *   pnk_source?: string,
 *   pnk_trial_sessions?: 1|2,
 * }} input
 */
export function buildPnkAttachClientRow(existing, input) {
  const name = formatClientName(input?.name) || existing?.name
  const phone = String(input?.phone ?? '').trim() || existing?.phone || null
  const cardIn = normalizeSalesCardNumber(input?.cardNumber)
  const existingCard = normalizeSalesCardNumber(existing?.card_number)
  const card_number = existingCard || cardIn || existing?.card_number || null
  const pnk = mergeNewPnkOntoClient({
    ...existing,
    trainer_id: input.trainerId,
    pnk_source: input?.pnk_source || 'manager',
    pnk_trial_sessions: input?.pnk_trial_sessions,
  })
  return {
    ...existing,
    name,
    phone,
    card_number,
    trainer_id: input.trainerId,
    ...pickClientPnkFields(pnk),
  }
}
