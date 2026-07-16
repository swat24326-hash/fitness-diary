/**
 * Старт бесплатной тренировки ПНК: абонемент БЗ + путь к форме.
 * Дата пробной в воронке — справочная; не ограничивает старт и срок БЗ.
 * Без React / IDB — для verify.
 */

import { isPnkTrialMembershipType } from '../membershipTypesCore.js'
import { pickUsableMembershipForDate } from '../membershipRules.js'
import { addDaysToIso } from '../dateRu.js'
import { isOpenPnkClient, parsePnkDeliverables } from './pnkStagesCore.js'

/**
 * Тип считается БЗ/пробной: флаг is_pnk_trial или код/имя «БЗ».
 * @param {object | null | undefined} t
 */
export function isPnkTrialTypeRow(t) {
  if (!t || t.is_active === false) return false
  if (isPnkTrialMembershipType(t)) return true
  const code = String(t.code ?? '').trim().toUpperCase()
  const name = String(t.name ?? '').trim().toUpperCase()
  return code === 'БЗ' || name === 'БЗ' || code === 'BZ' || name === 'BZ'
}

/**
 * Активный тип БЗ (пробная ПНК) в справочнике клуба.
 * Сначала флаг is_pnk_trial, иначе код/имя «БЗ».
 * @param {object[]} [types]
 */
export function findPnkTrialMembershipType(types) {
  const list = (types ?? []).filter((t) => t?.is_active !== false)
  return list.find((t) => isPnkTrialMembershipType(t)) ?? list.find((t) => isPnkTrialTypeRow(t)) ?? null
}

/**
 * Абонементы клиента с типом БЗ.
 * @param {object[]} [memberships]
 * @param {object[]} [membershipTypes]
 */
export function listPnkTrialMemberships(memberships, membershipTypes) {
  const typeIds = new Set(
    (membershipTypes ?? []).filter((t) => isPnkTrialTypeRow(t)).map((t) => String(t.id)),
  )
  if (!typeIds.size) return []
  return (memberships ?? []).filter((m) => typeIds.has(String(m?.membership_type_id ?? '')))
}

/**
 * Новый абонемент БЗ на одно занятие от сегодня (дата воронки не влияет на срок).
 * @param {{
 *   id: string,
 *   clientId: string,
 *   clubId: string,
 *   membershipTypeId: string,
 *   todayIso: string,
 *   nowIso?: string,
 *   validityDays?: number,
 * }} p
 */
export function buildPnkTrialMembershipRow(p) {
  const today = String(p.todayIso ?? '').slice(0, 10)
  const days = Number.isFinite(Number(p.validityDays)) ? Math.max(1, Number(p.validityDays)) : 14
  return {
    id: p.id,
    client_id: p.clientId,
    club_id: p.clubId,
    start_date: today,
    end_date: addDaysToIso(today, days),
    total_trainings: 1,
    used_trainings: 0,
    membership_type_id: p.membershipTypeId,
    created_at: p.nowIso || new Date().toISOString(),
  }
}

/**
 * Что делать перед открытием формы / добавлением БЗ.
 * Несколько БЗ у клиента — норма; без confirm.
 * @param {{
 *   memberships?: object[],
 *   membershipTypes?: object[],
 *   todayIso: string,
 *   forceNewBz?: boolean,
 * }} input
 * @returns {{ action: 'open' } | { action: 'create_bz', type: object } | { action: 'need_bz_type', error: string }}
 */
export function resolvePnkStartTrainingAction(input) {
  const today = String(input.todayIso ?? '').slice(0, 10)
  if (input.forceNewBz !== true && pickUsableMembershipForDate(input.memberships, today)) {
    return { action: 'open' }
  }
  const type = findPnkTrialMembershipType(input.membershipTypes)
  if (!type?.id) {
    return {
      action: 'need_bz_type',
      error: 'В клубе нет типа «БЗ». Создайте тип абонемента с кодом БЗ (или флагом ПНК / БЗ в админке).',
    }
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
