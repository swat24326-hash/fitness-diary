/**
 * Создание ПНК: attach к существующей карточке по карте/телефону, не второй clients.
 * Без confirm_attach сервер не пишет (INC-2026-11-04-02).
 */

import { formatClientName } from '../clientNameFormat.js'
import { formatDateRu } from '../dateRu.js'
import {
  matchClientByCardThenPhone,
  normalizeSalesCardNumber,
} from '../admin/salesClientMatchCore.js'
import {
  membershipCoversDate,
  membershipHasTypeId,
  membershipUsageLabel,
  pickUsableMembershipForDate,
} from '../membershipRules.js'
import { mergeNewPnkOntoClient, pickClientPnkFields } from './pnkClientFields.js'

function normalizeNameKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

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
 * Можно ли писать attach в БД (после явного confirm с UI).
 * @param {{ confirmAttach?: boolean }} input
 */
export function canWritePnkCreateAttach(input) {
  return input?.confirmAttach === true
}

/**
 * Превью найденной карточки для диалога confirm (без React).
 * @param {{
 *   client: object,
 *   memberships?: object[],
 *   todayIso?: string,
 *   proposedName?: string|null,
 * }} input
 */
export function buildPnkAttachMatchPreview(input) {
  const client = input?.client && typeof input.client === 'object' ? input.client : null
  if (!client?.id) return null
  const day = String(input?.todayIso ?? '').slice(0, 10)
  const mems = (input?.memberships ?? []).filter(Boolean)
  const typed = mems.filter(membershipHasTypeId)
  const usable = day ? pickUsableMembershipForDate(typed.length ? typed : mems, day) : null
  const covering =
    usable ||
    (day
      ? [...(typed.length ? typed : mems)]
          .filter((m) => membershipCoversDate(m, day))
          .sort((a, b) => String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')))[0]
      : null) ||
    [...(typed.length ? typed : mems)].sort((a, b) =>
      String(b.end_date ?? '').localeCompare(String(a.end_date ?? '')),
    )[0] ||
    null
  let membershipFact = ''
  if (covering) {
    const ends = covering.end_date ? `до ${formatDateRu(covering.end_date)}` : ''
    const usage = membershipUsageLabel(covering, [])
    membershipFact = [ends, usage !== '—' ? usage : ''].filter(Boolean).join(' · ')
  }
  const existingName = String(client.name ?? '').trim()
  const proposedName = formatClientName(input?.proposedName) || ''
  return {
    id: String(client.id),
    name: existingName || 'Клиент',
    card_number: String(client.card_number ?? '').trim(),
    phone: String(client.phone ?? '').trim(),
    membershipFact,
    nameDiffers: Boolean(
      proposedName && existingName && normalizeNameKey(proposedName) !== normalizeNameKey(existingName),
    ),
    proposedName,
  }
}

/**
 * Патч существующего client под ПНК (без второго clients).
 * ФИО существующего не трогаем, пока overwriteName !== true.
 * @param {object} existing
 * @param {{
 *   name?: string,
 *   phone?: string|null,
 *   cardNumber?: string|null,
 *   trainerId: string,
 *   pnk_source?: string,
 *   pnk_trial_sessions?: 1|2,
 *   overwriteName?: boolean,
 * }} input
 */
export function buildPnkAttachClientRow(existing, input) {
  const proposed = formatClientName(input?.name)
  const overwrite = input?.overwriteName === true
  const name = overwrite && proposed ? proposed : String(existing?.name ?? '').trim() || proposed
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
