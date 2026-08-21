/**
 * Ручное создание desk-клиента ТЗ/АЗ с списка клиентов (без React / IDB).
 * ПЗ сюда не входит — только litePzClientCreateCore.
 */

import { formatClientName } from '../clientNameFormat.js'
import { todayLocalIso } from '../dateRu.js'
import { normalizeDeskHall } from './deskHallClientsCore.js'
import {
  DESK_PACKAGE_MONTH_OPTIONS,
  deskPackageEndIso,
  parseDeskPaidAmountInput,
  parseDeskTotalTrainingsInput,
} from './deskMembershipLedgerCore.js'
import { assertClubCardAvailableForCreate } from './salesClientMatchCore.js'

/**
 * Вкладка списка → зал создания.
 * @param {unknown} clientsTab
 * @returns {'pz'|'tz'|'az'|null}
 */
export function manualCreateHallFromClientsTab(clientsTab) {
  const t = String(clientsTab ?? '').trim().toLowerCase()
  if (t === 'tz') return 'tz'
  if (t === 'az') return 'az'
  if (t === 'active' || t === 'pz') return 'pz'
  return null
}

/**
 * @param {unknown} raw
 * @returns {'pz'|'tz'|'az'|null}
 */
export function normalizeManualCreateHall(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'pz' || s === 'пз') return 'pz'
  if (s === 'tz' || s === 'тз') return 'tz'
  if (s === 'az' || s === 'аз') return 'az'
  const desk = normalizeDeskHall(raw)
  if (desk === 'tz' || desk === 'az') return desk
  return null
}

/**
 * @param {'tz'|'az'} hall
 * @param {string} [clubId]
 */
export function initialDeskManualCreateForm(hall, clubId = '') {
  const h = hall === 'az' ? 'az' : 'tz'
  const start = todayLocalIso()
  return {
    name: '',
    phone: '',
    card_number: '',
    club_id: clubId || '',
    hall: h,
    package_months: h === 'tz' ? '1' : '',
    start_date: start,
    end_date: deskPackageEndIso(start, h === 'tz' ? 1 : 3) || '',
    paid_amount: '',
    membership_type_id: '',
    total_trainings: h === 'az' ? '8' : '',
  }
}

/**
 * @param {object} form
 * @param {{
 *   azTypes?: object[]|null,
 *   clubClients?: object[]|null,
 * }} [opts]
 * @returns {{ ok: true, client: object, membership: object } | { ok: false, error: string }}
 */
export function validateDeskManualCreateForm(form, opts = {}) {
  const hall = normalizeManualCreateHall(form?.hall)
  if (hall !== 'tz' && hall !== 'az') {
    return { ok: false, error: 'Выберите зал ТЗ или АЗ' }
  }

  const name = formatClientName(form?.name)
  if (!name) return { ok: false, error: 'Укажите ФИО' }

  const clubId = String(form?.club_id ?? '').trim()
  if (!clubId) return { ok: false, error: 'Выберите клуб' }

  const start = String(form?.start_date ?? '').trim().slice(0, 10)
  if (!start) return { ok: false, error: 'Укажите начало абонемента' }

  let end = String(form?.end_date ?? '').trim().slice(0, 10)
  if (hall === 'tz') {
    const months = Number(form?.package_months)
    if (!end && Number.isFinite(months) && months > 0) {
      end = deskPackageEndIso(start, months) || ''
    }
  }
  if (!end) return { ok: false, error: 'Укажите окончание абонемента' }
  if (end < start) return { ok: false, error: 'Окончание не может быть раньше начала' }

  const paidRaw = form?.paid_amount
  const paid =
    paidRaw === '' || paidRaw == null ? null : parseDeskPaidAmountInput(paidRaw)
  if (paidRaw !== '' && paidRaw != null && paid == null) {
    return { ok: false, error: 'Цена должна быть числом ≥ 0' }
  }

  let membershipTypeId = null
  let totalTrainings = 0

  if (hall === 'az') {
    const typeId = String(form?.membership_type_id ?? '').trim()
    if (!typeId) return { ok: false, error: 'Выберите направление АЗ' }
    const azTypes = Array.isArray(opts.azTypes) ? opts.azTypes : []
    const hit = azTypes.find((t) => String(t?.id ?? '') === typeId)
    if (!hit) return { ok: false, error: 'Направление АЗ не найдено в справочнике' }
    membershipTypeId = typeId

    const total = parseDeskTotalTrainingsInput(form?.total_trainings)
    if (total == null || total < 1) {
      return { ok: false, error: 'Укажите число занятий (≥ 1)' }
    }
    totalTrainings = total
  }

  const cardRaw = String(form?.card_number ?? '').trim() || null
  if (opts.clubClients != null) {
    const cardCheck = assertClubCardAvailableForCreate(opts.clubClients, clubId, cardRaw)
    if (!cardCheck.ok) return { ok: false, error: cardCheck.error }
  }

  return {
    ok: true,
    client: {
      name,
      phone: String(form?.phone ?? '').trim() || null,
      card_number: cardRaw,
      trainer_id: null,
      club_id: clubId,
      desk_hall: hall,
      lifecycle: 'active',
    },
    membership: {
      start_date: start,
      end_date: end,
      paid_amount: paid,
      total_trainings: totalTrainings,
      used_trainings: 0,
      membership_type_id: membershipTypeId,
      hall,
    },
  }
}

export { DESK_PACKAGE_MONTH_OPTIONS }
