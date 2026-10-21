/**
 * Мгновенный абонемент из клипа менеджера: обязательные поля, строка пакета, дубль за день, перевод тренера.
 * Кнопка планшета по-прежнему читает membershipFieldsFromSaleClip (+1 месяц). Здесь этого нет.
 * Без React / IDB.
 */

import { todayLocalIso } from '../dateRu.js'
import { normalizeMembershipTotalTrainings, validateMembershipTotalAgainstUsed } from '../membership/membershipTotalGuardCore.js'
import { saleClipNeedsTransferConfirm } from './saleClipMatchPreviewCore.js'

/**
 * @param {unknown} raw
 * @returns {string}
 */
function isoDateOrEmpty(raw) {
  const s = String(raw ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/**
 * Тип, дата окончания и число занятий обязательны. Пустой конец — ошибка, не «+1 месяц».
 * @param {object|null|undefined} draft
 * @param {string} [asOf]
 * @returns {{ ok: true, reason: '', fields: { start_date: string, end_date: string, total_trainings: number, membership_type_id: string } } | { ok: false, reason: string }}
 */
export function validateInstantSaleClipMembership(draft, asOf = todayLocalIso()) {
  const membership_type_id = String(draft?.membership_type_id ?? '').trim()
  if (!membership_type_id) return { ok: false, reason: 'Укажите тип абонемента' }

  const rawTotal = draft?.total_trainings
  if (rawTotal == null || String(rawTotal).trim() === '') {
    return { ok: false, reason: 'Укажите число занятий' }
  }
  const totalNum = Number(rawTotal)
  if (!Number.isFinite(totalNum) || totalNum <= 0) {
    return { ok: false, reason: 'Число занятий должно быть больше 0' }
  }
  const total_trainings = normalizeMembershipTotalTrainings(totalNum)

  const today = String(asOf).slice(0, 10)
  const start = isoDateOrEmpty(draft?.start_date) || (/^\d{4}-\d{2}-\d{2}$/.test(today) ? today : '')
  if (!start) return { ok: false, reason: 'Некорректная дата начала' }

  const end = isoDateOrEmpty(draft?.end_date)
  if (!end) return { ok: false, reason: 'Укажите дату окончания' }
  if (end < start) return { ok: false, reason: 'Дата окончания раньше начала' }

  return {
    ok: true,
    reason: '',
    fields: { start_date: start, end_date: end, total_trainings, membership_type_id },
  }
}

/**
 * Поля как у планшета: зал ПЗ, списаний нет, ссылка на клип. updated_at в таблице нет.
 * @param {{
 *   id: string,
 *   clientId: string,
 *   clubId: string,
 *   clipId: string,
 *   fields: { start_date: string, end_date: string, total_trainings: number, membership_type_id: string },
 *   now: string,
 * }} input
 */
export function buildInstantMembershipInsert(input) {
  return {
    id: String(input.id),
    client_id: String(input.clientId),
    club_id: String(input.clubId),
    start_date: input.fields.start_date,
    end_date: input.fields.end_date,
    total_trainings: input.fields.total_trainings,
    used_trainings: 0,
    membership_type_id: input.fields.membership_type_id,
    clip_id: String(input.clipId),
    hall: 'pz',
    created_at: input.now,
  }
}

/**
 * Тот же клиент, тип, даты и число занятий, созданные в этот день — второй пакет не нужен.
 * @param {object[]|null|undefined} memberships
 * @param {{ start_date: string, end_date: string, total_trainings: number, membership_type_id: string }} fields
 * @param {string} day
 * @returns {object|null}
 */
export function findSameDayDuplicateMembership(memberships, fields, day) {
  const dayIso = String(day ?? '').slice(0, 10)
  const typeId = String(fields?.membership_type_id ?? '')
  const start = String(fields?.start_date ?? '').slice(0, 10)
  const end = String(fields?.end_date ?? '').slice(0, 10)
  const total = Number(fields?.total_trainings)
  if (!typeId || !start || !end || !(total > 0)) return null

  for (const m of memberships ?? []) {
    if (String(m?.membership_type_id ?? '') !== typeId) continue
    if (String(m?.start_date ?? '').slice(0, 10) !== start) continue
    if (String(m?.end_date ?? '').slice(0, 10) !== end) continue
    if (Number(m?.total_trainings) !== total) continue
    const created = String(m?.created_at ?? '').slice(0, 10)
    if (dayIso && created && created !== dayIso) continue
    if (dayIso && !created && start !== dayIso) continue
    return m
  }
  return null
}

/**
 * Другой тренер на карточке — смена только после confirm_transfer.
 * @param {{ client?: object|null, selectedTrainerId?: unknown, confirmTransfer?: boolean }} input
 * @returns {{ ok: true, trainerId: string, transferred: boolean } | { ok: false, reason: string }}
 */
export function planSaleClipTrainerAssign(input = {}) {
  const selected = String(input.selectedTrainerId ?? '').trim()
  if (!input.client) return { ok: true, trainerId: selected, transferred: false }
  if (!saleClipNeedsTransferConfirm(input.client, selected)) {
    const current = String(input.client.trainer_id ?? '').trim()
    return { ok: true, trainerId: current || selected, transferred: false }
  }
  if (input.confirmTransfer === true) return { ok: true, trainerId: selected, transferred: true }
  return { ok: false, reason: 'Этот клиент сейчас у другого тренера. Подтвердите перевод.' }
}

/**
 * Менеджер правит только даты и число занятий у пакета этой продажи и своего клуба.
 * @param {{
 *   clubId?: unknown,
 *   clip?: object|null,
 *   membership?: object|null,
 *   startDate?: unknown,
 *   endDate?: unknown,
 *   totalTrainings?: unknown,
 * }} input
 * @returns {{ ok: true, patch: { start_date: string, end_date: string, total_trainings: number } } | { ok: false, reason: string }}
 */
export function planSaleClipMembershipUpdate(input = {}) {
  const clubId = String(input.clubId ?? '').trim()
  const clip = input.clip
  const membership = input.membership
  if (!clip?.id) return { ok: false, reason: 'Клип не найден' }
  if (String(clip.club_id ?? '') !== clubId) return { ok: false, reason: 'Клип другого клуба' }
  if (!membership?.id) return { ok: false, reason: 'У этой продажи нет абонемента' }
  if (String(membership.club_id ?? '') !== clubId) return { ok: false, reason: 'Абонемент другого клуба' }
  const linked =
    String(clip.membership_id ?? '') === String(membership.id) ||
    (clip.id && String(membership.clip_id ?? '') === String(clip.id))
  if (!linked) return { ok: false, reason: 'Это не пакет этой продажи' }

  const start = isoDateOrEmpty(input.startDate ?? membership.start_date)
  const end = isoDateOrEmpty(input.endDate ?? membership.end_date)
  if (!start || !end) return { ok: false, reason: 'Укажите даты начала и окончания' }
  if (end < start) return { ok: false, reason: 'Дата окончания раньше начала' }

  const totalCheck = validateMembershipTotalAgainstUsed({
    totalTrainings: input.totalTrainings,
    usedStored: membership.used_trainings,
  })
  if (!totalCheck.ok) return { ok: false, reason: totalCheck.error }
  if (!(totalCheck.total > 0)) return { ok: false, reason: 'Укажите число занятий' }

  return {
    ok: true,
    patch: {
      start_date: start,
      end_date: end,
      total_trainings: totalCheck.total,
    },
  }
}
