/**
 * Применение действий связки оплат → lite / клип / desk.
 * Один № карты = один client; другой зал → дописать membership.
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
  parsePaymentLinkCustomPackageMonths,
} from './salesPaymentsLinkCore.js'
import { isTrainerWithoutTablet } from './trainerTabletModeCore.js'
import { listClientsByClubId } from '../localDbClubQuery.js'
import {
  assertClubCardAvailableForCreate,
  normalizeSalesCardNumber,
} from './salesClientMatchCore.js'
import { isClientArchived } from '../clientArchive.js'

function findClubClientsByCard(clubClients, clubId, cardNumber) {
  const n = normalizeSalesCardNumber(cardNumber)
  const cid = String(clubId ?? '').trim()
  if (!n || !cid) return []
  const matches = (clubClients ?? []).filter(
    (c) =>
      String(c?.club_id ?? '').trim() === cid && normalizeSalesCardNumber(c?.card_number) === n,
  )
  const ops = matches.filter((c) => !isClientArchived(c))
  const pool = ops.length ? ops : matches
  pool.sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))
  return pool
}

/**
 * @param {object} existing
 * @param {object} action
 * @param {Record<string, unknown>} [extra]
 */
function clientUpdatePatch(existing, action, extra = {}) {
  const now = new Date().toISOString()
  const patch = {
    ...existing,
    ...extra,
    name: formatClientName(action.clientName) || existing.name,
    updated_at: now,
  }
  if (action?.needsRestore || isClientArchived(existing)) {
    patch.archived_at = null
  }
  return patch
}

function pickExistingClientForPayment(clubClients, clubId, action) {
  if (action?.attachClientId) {
    const hit = (clubClients ?? []).find((c) => String(c.id) === String(action.attachClientId))
    if (hit) return { ok: true, client: hit }
  }
  const pool = findClubClientsByCard(clubClients, clubId, action?.cardNumber)
  if (pool.length > 1) {
    return {
      ok: false,
      error: `Несколько клиентов с картой №${normalizeSalesCardNumber(action?.cardNumber)} — разберите в «Клиенты», не создавайте ещё одну`,
    }
  }
  if (pool.length === 1) return { ok: true, client: pool[0] }
  return { ok: true, client: null }
}

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

  if (action.kind === 'skip_matched' || action.kind === 'skip_cross_hall') {
    return { ok: true, result: 'skipped' }
  }
  if (action.kind === 'card_conflict') {
    return {
      ok: false,
      error: String(action.error ?? '').trim() || 'Конфликт карты — сначала разберите дубли в «Клиенты»',
    }
  }
  if (action.kind === 'restore_archived') {
    return applyRestoreArchivedFromPayment({ action, clubId })
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

async function applyRestoreArchivedFromPayment({ action, clubId }) {
  const clientId = String(action.attachClientId || action.clientId || '').trim()
  if (!clientId) return { ok: false, error: 'Нет карточки для возврата из архива' }
  const clubClients = await listClientsByClubId(clubId)
  const existing = (clubClients ?? []).find((c) => String(c.id) === clientId)
  if (!existing) return { ok: false, error: 'Клиент не найден в клубе' }
  if (!isClientArchived(existing)) {
    return { ok: true, result: 'restored', clientId, alreadyActive: true }
  }
  const patch = clientUpdatePatch(existing, action)
  await saveLocalWithSync('clients', patch, {
    table_name: 'clients',
    operation: 'update',
    remote_id: clientId,
  })
  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, 'Возврат из архива')
  dispatchLocalDataChanged({ reason: 'payments-link-restore', clientId })
  return { ok: true, result: 'restored', clientId, warning: warn || null }
}

async function applyLiteFromPayment({ action, clubId, reportDate, trainers }) {
  const noTab = listNoTabletTrainersForClub(trainers, clubId)
  const months = parsePaymentLinkCustomPackageMonths(action.packageMonths)
  if (months == null) return { ok: false, error: 'Укажите срок пакета' }
  const start = reportDate
  const end = deskPackageEndIso(start, months)
  const clubClients = await listClientsByClubId(clubId)
  const existingPick = pickExistingClientForPayment(clubClients, clubId, action)
  if (!existingPick.ok) return { ok: false, error: existingPick.error }
  const existing = existingPick.client

  if (existing?.id) {
    const now = new Date().toISOString()
    const clientId = String(existing.id)
    const patch = clientUpdatePatch(existing, action, {
      trainer_id: action.trainerId || existing.trainer_id,
    })
    await saveLocalWithSync('clients', patch, {
      table_name: 'clients',
      operation: 'update',
      remote_id: clientId,
    })
    await saveLocalWithSync(
      'memberships',
      {
        id: crypto.randomUUID(),
        client_id: clientId,
        club_id: clubId,
        membership_type_id: null,
        start_date: start,
        end_date: end,
        total_trainings: 0,
        used_trainings: 0,
        paid_amount: action.amount > 0 ? action.amount : null,
        hall: 'pz',
        created_at: now,
      },
      { table_name: 'memberships', operation: 'insert', remote_id: null },
    )
    const flush = await flushCriticalWritesToCloud()
    const warn = criticalWriteCloudWarning(
      flush,
      action.needsRestore ? 'Lite ПЗ: возврат из архива' : 'Lite ПЗ к существующей карточке',
    )
    dispatchLocalDataChanged({ reason: 'payments-link-lite-attach', clientId })
    return { ok: true, result: 'lite', clientId, attached: true, restored: Boolean(action.needsRestore), warning: warn || null }
  }

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
      hall: 'pz',
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
  const months = parsePaymentLinkCustomPackageMonths(action.packageMonths)
  if (months == null) return { ok: false, error: 'Укажите срок пакета' }
  const start = reportDate
  const end = deskPackageEndIso(start, months)
  const clubClients = await listClientsByClubId(clubId)
  const existingPick = pickExistingClientForPayment(clubClients, clubId, action)
  if (!existingPick.ok) return { ok: false, error: existingPick.error }
  if (existingPick.client?.id) {
    const now = new Date().toISOString()
    const clientId = String(existingPick.client.id)
    const patch = clientUpdatePatch(existingPick.client, action, {
      trainer_id: action.trainerId || existingPick.client.trainer_id,
    })
    await saveLocalWithSync('clients', patch, {
      table_name: 'clients',
      operation: 'update',
      remote_id: clientId,
    })
    await saveLocalWithSync(
      'memberships',
      {
        id: crypto.randomUUID(),
        client_id: clientId,
        club_id: clubId,
        membership_type_id: null,
        start_date: start,
        end_date: end,
        total_trainings: 0,
        used_trainings: 0,
        paid_amount: action.amount > 0 ? action.amount : null,
        hall: 'pz',
        created_at: now,
      },
      { table_name: 'memberships', operation: 'insert', remote_id: null },
    )
    const flush = await flushCriticalWritesToCloud()
    const warn = criticalWriteCloudWarning(
      flush,
      action.needsRestore ? 'ПЗ: возврат из архива' : 'ПЗ-абон к существующей карточке',
    )
    dispatchLocalDataChanged({ reason: 'payments-link-pz-attach', clientId })
    return { ok: true, result: 'clip', clientId, attached: true, restored: Boolean(action.needsRestore), warning: warn || null }
  }
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
  const months = parsePaymentLinkCustomPackageMonths(action.packageMonths)
  if (months == null) return { ok: false, error: 'Укажите срок пакета' }
  const start = reportDate
  const end = deskPackageEndIso(start, months)
  if (!end) return { ok: false, error: 'Не удалось посчитать срок абона' }

  const clubClients = await listClientsByClubId(clubId)
  const existingPick = pickExistingClientForPayment(clubClients, clubId, action)
  if (!existingPick.ok) return { ok: false, error: existingPick.error }
  const existing = existingPick.client

  const now = new Date().toISOString()
  const memRow = {
    id: crypto.randomUUID(),
    club_id: clubId,
    membership_type_id: hall === 'az' && action.membershipTypeId ? action.membershipTypeId : null,
    start_date: start,
    end_date: end,
    paid_amount: action.amount > 0 ? action.amount : null,
    total_trainings: 0,
    used_trainings: 0,
    hall,
    created_at: now,
  }

  if (existing?.id) {
    const clientId = String(existing.id)
    if (action.needsRestore || isClientArchived(existing)) {
      const patch = clientUpdatePatch(existing, action)
      await saveLocalWithSync('clients', patch, {
        table_name: 'clients',
        operation: 'update',
        remote_id: clientId,
      })
    }
    await saveLocalWithSync(
      'memberships',
      { ...memRow, client_id: clientId },
      { table_name: 'memberships', operation: 'insert', remote_id: null },
    )
    // legacy desk_hall: если клиент был чистый ПЗ — не затираем trainer; desk_hall можно не ставить
    const flush = await flushCriticalWritesToCloud()
    const warn = criticalWriteCloudWarning(
      flush,
      action.needsRestore ? 'Desk: возврат из архива' : 'Desk-абон к карточке',
    )
    dispatchLocalDataChanged({ reason: 'payments-link-desk-attach', clientId })
    return { ok: true, result: hall, clientId, attached: true, restored: Boolean(action.needsRestore), warning: warn || null }
  }

  const cardCheck = assertClubCardAvailableForCreate(clubClients, clubId, action.cardNumber)
  if (!cardCheck.ok) return { ok: false, error: cardCheck.error }

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
    { ...memRow, client_id: clientId },
    { table_name: 'memberships', operation: 'insert', remote_id: null },
  )
  const flush = await flushCriticalWritesToCloud()
  const warn = criticalWriteCloudWarning(flush, 'Desk из оплат')
  dispatchLocalDataChanged({ reason: 'payments-link-desk', clientId })
  return { ok: true, result: hall, clientId, warning: warn || null }
}
