/**
 * Старт бесплатной тренировки ПНК: абонемент БЗ + путь к форме.
 * Без React / IDB — для verify.
 */

import { isPnkTrialMembershipType } from '../membershipTypesCore.js'
import { membershipIsUsableOn, pickUsableMembershipForDate } from '../membershipRules.js'
import { addDaysToIso } from '../dateRu.js'
import { isOpenPnkClient, parsePnkDeliverables } from './pnkStagesCore.js'

/**
 * Активный тип БЗ (пробная ПНК) в справочнике клуба.
 * @param {object[]} [types]
 */
export function findPnkTrialMembershipType(types) {
  return (types ?? []).find((t) => isPnkTrialMembershipType(t) && t?.is_active !== false) ?? null
}

/**
 * Абонементы клиента с типом БЗ.
 * @param {object[]} [memberships]
 * @param {object[]} [membershipTypes]
 */
export function listPnkTrialMemberships(memberships, membershipTypes) {
  const typeIds = new Set(
    (membershipTypes ?? [])
      .filter((t) => isPnkTrialMembershipType(t))
      .map((t) => String(t.id)),
  )
  if (!typeIds.size) return []
  return (memberships ?? []).filter((m) => typeIds.has(String(m?.membership_type_id ?? '')))
}

/**
 * Черновик абонемента БЗ на одно занятие, покрывающий сегодня и дату пробной.
 * @param {{
 *   id: string,
 *   clientId: string,
 *   clubId: string,
 *   membershipTypeId: string,
 *   todayIso: string,
 *   trialDateIso?: string | null,
 *   nowIso?: string,
 * }} p
 */
export function buildPnkTrialMembershipRow(p) {
  const today = String(p.todayIso ?? '').slice(0, 10)
  const trial = String(p.trialDateIso ?? '').slice(0, 10)
  const start = trial && trial < today ? trial : today
  const endAnchor = trial && trial > today ? trial : today
  const end = addDaysToIso(endAnchor, 7)
  return {
    id: p.id,
    client_id: p.clientId,
    club_id: p.clubId,
    start_date: start,
    end_date: end,
    total_trainings: 1,
    used_trainings: 0,
    membership_type_id: p.membershipTypeId,
    created_at: p.nowIso || new Date().toISOString(),
  }
}

/**
 * Что делать перед открытием формы тренировки.
 * @param {{
 *   memberships?: object[],
 *   membershipTypes?: object[],
 *   todayIso: string,
 *   allowCreateAfterDepleted?: boolean,
 * }} input
 * @returns {{ action: 'open' } | { action: 'create_bz', type: object } | { action: 'confirm_new_bz', type: object } | { action: 'need_bz_type', error: string }}
 */
export function resolvePnkStartTrainingAction(input) {
  const today = String(input.todayIso ?? '').slice(0, 10)
  if (pickUsableMembershipForDate(input.memberships, today)) {
    return { action: 'open' }
  }
  const type = findPnkTrialMembershipType(input.membershipTypes)
  if (!type?.id) {
    return {
      action: 'need_bz_type',
      error: 'В клубе нет типа абонемента БЗ (пробная). Добавьте его в типах абонементов с флагом «ПНК / БЗ».',
    }
  }
  const priorBz = listPnkTrialMemberships(input.memberships, input.membershipTypes)
  const hasUnusablePrior = priorBz.some((m) => !membershipIsUsableOn(m, today))
  if (hasUnusablePrior && input.allowCreateAfterDepleted !== true) {
    return { action: 'confirm_new_bz', type }
  }
  return { action: 'create_bz', type }
}

/**
 * После завершения тренировки — предложить отметить пробную в воронке.
 * @param {object | null | undefined} client
 */
export function shouldOfferMarkPnkTrialDone(client) {
  if (!isOpenPnkClient(client)) return false
  const d = parsePnkDeliverables(client?.pnk_deliverables)
  if (d.trial) return false
  const stage = String(client?.pnk_stage ?? '')
  if (stage === 'trial_done' || stage === 'followup' || stage === 'won' || stage === 'lost') return false
  return Boolean(client?.pnk_trial_date) || stage === 'agreed'
}

/**
 * URL новой тренировки с уже выбранным клиентом.
 * @param {{ clientId: string, clubId?: string | null, isAdmin?: boolean }} p
 */
export function buildPnkNewWorkoutPath(p) {
  const base = p.isAdmin ? '/admin/workouts/new' : '/trainer/workouts/new'
  const qs = new URLSearchParams()
  qs.set('clientId', String(p.clientId))
  const club = String(p.clubId ?? '').trim()
  if (club) qs.set('club', club)
  return `${base}?${qs.toString()}`
}
