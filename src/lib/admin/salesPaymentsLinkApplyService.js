/**
 * Применение действий связки оплат → lite / клип / desk.
 */

import { formatClientName } from '../clientNameFormat.js'
import {
  criticalWriteCloudWarning,
  flushCriticalWritesToCloud,
  saveLocalWithSync,
} from '../syncService.js'
import { dispatchLocalDataChanged } from '../dataAccess.js'
import { deskPackageEndIso } from './deskMembershipLedgerCore.js'
import { validateLitePzCreateForm, listNoTabletTrainersForClub } from './litePzClientCreateCore.js'
import { createSaleClip } from './saleClipService.js'
import {
  resolvePzLinkMode,
  validatePaymentLinkAction,
} from './salesPaymentsLinkCore.js'
import { isTrainerWithoutTablet } from './trainerTabletModeCore.js'
import { listClientsByClubId } from '../localDbClubQuery.js'
import { assertClubCardAvailableForCreate } from './salesClientMatchCore.js'

/**
 * @param {{
 *   action: object,
 *   clubId: string,
 *   reportDate: string,
 *   trainers: object[],
 * }} input
 */
export async function applyPaymentClientLinkAction(input) {
  const clubId = String(input.clubId ?? '').trim()
  const reportDate = String(input.reportDate ?? '').slice(0, 10)
  const action = input.action
  const trainers = input.trainers ?? []
  if (!clubId) return { ok: false, error: 'Нет клуба' }
  if (!action) return { ok: false, error: 'Нет действия' }

  if (action.kind === 'skip_matched') {
    return { ok: true, result: 'skipped' }
  }

  const trainer = trainers.find((t) => String(t.id) === String(action.trainerId ?? ''))
  const checked = validatePaymentLinkAction(action, trainer)
  if (!checked.ok) return { ok: false, error: checked.error }

  if (action.kind === 'pz_need_trainer') {
    const mode = checked.mode || resolvePzLinkMode(trainer)
    if (mode === 'lite') {
      return applyLiteFromPayment({ action, clubId, reportDate, trainers })
    }
    return applyClipFromPayment({ action, clubId, reportDate, trainer })
  }

  if (action.kind === 'az_desk' || action.kind === 'tz_desk') {
    return applyDeskFromPayment({ action, clubId, reportDate })
  }

  return { ok: false, error: 'Неизвестное действие' }
}

async function applyLiteFromPayment({ action, clubId, reportDate, trainers }) {
  const noTab = listNoTabletTrainersForClub(trainers, clubId)
  const months = Number(action.packageMonths) > 0 ? Number(action.packageMonths) : 1
  const start = reportDate
  const end = deskPackageEndIso(start, months)
  const form = {
    name: action.clientName,
    phone: '',
    card_number: action.cardNumber,
    trainer_id: action.trainerId,
    club_id: clubId,
    start_date: start,
    end_date: end,
    package_months: months,
    paid_amount: action.amount > 0 ? String(action.amount) : '',
  }
  const clubClients = await listClientsByClubId(clubId)
  const validated = validateLitePzCreateForm(form, noTab, clubClients)
  if (!validated.ok) return { ok: false, error: validated.error }

  const now = new Date().toISOString()
  const clientId = crypto.randomUUID()
  await saveLocalWithSync(
    'clients',
    { id: clientId, ...validated.client, created_at: now },
    { table_name: 'clients', operation: 'insert', remote_id: clientId },
  )
  await saveLocalWithSync(
    'memberships',
    {
      id: crypto.randomUUID(),
      client_id: clientId,
      club_id: clubId,
      membership_type_id: null,
      ...validated.membership,
      created_at: now,
    },
    { table_name: 'memberships', operation: 'insert', remote_id: null },
  )
  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, 'Lite ПЗ из оплат')
  dispatchLocalDataChanged({ reason: 'payments-link-lite', clientId })
  return { ok: true, result: 'lite', clientId, warning: warn || null }
}

async function applyClipFromPayment({ action, clubId, reportDate, trainer }) {
  if (isTrainerWithoutTablet(trainer)) {
    return { ok: false, error: 'Для тренера без планшета нужен lite, не клип' }
  }
  const months = Number(action.packageMonths) > 0 ? Number(action.packageMonths) : 1
  const start = reportDate
  const end = deskPackageEndIso(start, months)
  const data = await createSaleClip({
    club_id: clubId,
    client_name: formatClientName(action.clientName),
    card_number: action.cardNumber,
    trainer_id: action.trainerId,
    clip_date: reportDate,
    start_date: start,
    end_date: end,
    note: action.amount > 0 ? `Оплата ${action.amount} ₽ · ${action.tariffName || ''}`.trim() : action.tariffName || null,
  })
  return { ok: true, result: 'clip', clipId: data?.clip?.id ?? data?.id ?? null }
}

async function applyDeskFromPayment({ action, clubId, reportDate }) {
  const hall = action.kind === 'az_desk' ? 'az' : 'tz'
  const months = Number(action.packageMonths) > 0 ? Number(action.packageMonths) : 1
  const start = reportDate
  const end = deskPackageEndIso(start, months)
  if (!end) return { ok: false, error: 'Не удалось посчитать срок абона' }

  const clubClients = await listClientsByClubId(clubId)
  const cardCheck = assertClubCardAvailableForCreate(clubClients, clubId, action.cardNumber)
  if (!cardCheck.ok) return { ok: false, error: cardCheck.error }

  const now = new Date().toISOString()
  const clientId = crypto.randomUUID()
  const name = formatClientName(action.clientName)
  await saveLocalWithSync(
    'clients',
    {
      id: clientId,
      name,
      phone: null,
      card_number: action.cardNumber || null,
      trainer_id: null,
      desk_hall: hall,
      club_id: clubId,
      created_at: now,
    },
    { table_name: 'clients', operation: 'insert', remote_id: clientId },
  )
  await saveLocalWithSync(
    'memberships',
    {
      id: crypto.randomUUID(),
      client_id: clientId,
      club_id: clubId,
      membership_type_id: hall === 'az' && action.membershipTypeId ? action.membershipTypeId : null,
      start_date: start,
      end_date: end,
      paid_amount: action.amount > 0 ? action.amount : null,
      total_trainings: 0,
      used_trainings: 0,
      created_at: now,
    },
    { table_name: 'memberships', operation: 'insert', remote_id: null },
  )
  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, 'Desk из оплат')
  dispatchLocalDataChanged({ reason: 'payments-link-desk', clientId })
  return { ok: true, result: hall, clientId, warning: warn || null }
}
