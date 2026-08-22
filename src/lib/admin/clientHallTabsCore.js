/**
 * Вкладки залов на карточке клиента (admin / sales).
 */

import { clientMembershipHallSet, normalizeMembershipHall } from '../membershipHallCore.js'
import { resolveAdminClientHallTabWithLifecycle } from './adminClientsListLifecycleCore.js'

/** @typedef {'pz'|'tz'|'az'} ClientHallTab */

export const CLIENT_HALL_TAB_ORDER = /** @type {const} */ (['pz', 'tz', 'az'])

export const CLIENT_HALL_TAB_LABELS = {
  pz: 'ПЗ',
  tz: 'ТЗ',
  az: 'АЗ',
}

/**
 * Есть ли уже desk-зал (ТЗ/АЗ) — для точек на вкладках / эвристик.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memberships
 */
export function clientNeedsMultiHallCard(client, memberships) {
  const halls = clientMembershipHallSet(client, memberships)
  return halls.has('tz') || halls.has('az')
}

/**
 * Админ / менеджер / управляющий: всегда одна CRM-карточка с переключателем ПЗ/ТЗ/АЗ
 * (можно дописать абон другого зала без второй карточки клиента).
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isSupervisor?: boolean }|null|undefined} access
 * @param {object|null|undefined} client
 */
export function adminUsesMultiHallClientCard(access, client) {
  return Boolean(client && roleCanManageMultiHallClientCard(access))
}

/**
 * Admin / менеджер / управляющий — вкладки ПЗ/ТЗ/АЗ и desk-учёт.
 * Тренер планшета — только свой ПЗ-контур.
 * @param {{ isAdmin?: boolean, isSalesManager?: boolean, isSupervisor?: boolean }|null|undefined} access
 */
export function roleCanManageMultiHallClientCard(access) {
  return Boolean(access?.isAdmin || access?.isSalesManager || access?.isSupervisor)
}

/**
 * Тренер видит в pull/списке только клиентов с trainer_id = я (не desk-only).
 * @param {object|null|undefined} client
 * @param {string|null|undefined} trainerUserId
 */
export function trainerOwnsClientForTablet(client, trainerUserId) {
  const tid = String(trainerUserId ?? '').trim()
  const cid = String(client?.trainer_id ?? '').trim()
  return Boolean(tid && cid && tid === cid)
}

/**
 * Стартовая вкладка: приоритет зал из списка / desk / открытые залы.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memberships
 * @param {unknown} [preferred]
 * @param {{ lifecycleRows?: object[], asOf?: string }|null|undefined} [lifecycleCtx]
 * @returns {ClientHallTab}
 */
export function resolveInitialClientHallTab(client, memberships, preferred, lifecycleCtx) {
  if (lifecycleCtx) {
    return resolveAdminClientHallTabWithLifecycle(client, memberships, preferred, lifecycleCtx)
  }
  const want = normalizeMembershipHall(preferred)
  const halls = clientMembershipHallSet(client, memberships)
  if (want && halls.has(want)) return want
  if (want === 'tz' || want === 'az' || want === 'pz') return want
  if (halls.has('tz')) return 'tz'
  if (halls.has('az')) return 'az'
  return 'pz'
}
