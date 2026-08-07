/**
 * Чистые правила создания lite-клиента ПЗ (тренер без планшета).
 * Без React / IDB.
 */

import { isTrainerWithoutTablet } from './trainerTabletModeCore.js'
import { deskPackageEndIso, parseDeskPaidAmountInput } from './deskMembershipLedgerCore.js'
import { formatClientName } from '../clientNameFormat.js'
import { assertClubCardAvailableForCreate } from './salesClientMatchCore.js'

/**
 * @param {object[]} trainers
 * @param {string} clubId
 */
export function listNoTabletTrainersForClub(trainers, clubId) {
  const cid = String(clubId ?? '').trim()
  return (trainers ?? []).filter((t) => {
    if (!isTrainerWithoutTablet(t)) return false
    if (t?.is_active === false) return false
    if (!cid) return true
    return String(t.club_id ?? '').trim() === cid
  })
}

/**
 * @param {{
 *   name?: string,
 *   phone?: string,
 *   card_number?: string,
 *   trainer_id?: string,
 *   club_id?: string,
 *   start_date?: string,
 *   package_months?: string|number,
 *   end_date?: string,
 *   paid_amount?: string|number,
 * }} form
 * @param {object[]} noTabletTrainers
 * @param {object[]|null|undefined} [clubClients] клиенты клуба для проверки уникальности карты
 */
export function validateLitePzCreateForm(form, noTabletTrainers, clubClients) {
  const name = formatClientName(form?.name)
  if (!name) return { ok: false, error: 'Укажите ФИО' }

  const clubId = String(form?.club_id ?? '').trim()
  if (!clubId) return { ok: false, error: 'Выберите клуб' }

  const trainerId = String(form?.trainer_id ?? '').trim()
  if (!trainerId) return { ok: false, error: 'Выберите тренера без планшета' }

  const trainer = (noTabletTrainers ?? []).find((t) => String(t.id) === trainerId)
  if (!trainer) return { ok: false, error: 'Тренер должен быть без планшета и из этого клуба' }

  const start = String(form?.start_date ?? '').trim().slice(0, 10)
  if (!start) return { ok: false, error: 'Укажите начало абонемента' }

  let end = String(form?.end_date ?? '').trim().slice(0, 10)
  const months = Number(form?.package_months)
  if (!end && Number.isFinite(months) && months > 0) {
    end = deskPackageEndIso(start, months) || ''
  }
  if (!end) return { ok: false, error: 'Укажите окончание абонемента или пакет' }
  if (end < start) return { ok: false, error: 'Окончание не может быть раньше начала' }

  const paidRaw = form?.paid_amount
  const paid =
    paidRaw === '' || paidRaw == null ? null : parseDeskPaidAmountInput(paidRaw)
  if (paidRaw !== '' && paidRaw != null && paid == null) {
    return { ok: false, error: 'Цена должна быть числом ≥ 0' }
  }

  const cardRaw = String(form?.card_number ?? '').trim() || null
  if (clubClients != null) {
    const cardCheck = assertClubCardAvailableForCreate(clubClients, clubId, cardRaw)
    if (!cardCheck.ok) return { ok: false, error: cardCheck.error }
  }

  return {
    ok: true,
    client: {
      name,
      phone: String(form?.phone ?? '').trim() || null,
      card_number: cardRaw,
      trainer_id: trainerId,
      club_id: clubId,
      desk_hall: null,
    },
    membership: {
      start_date: start,
      end_date: end,
      paid_amount: paid,
      total_trainings: 0,
      used_trainings: 0,
    },
  }
}
