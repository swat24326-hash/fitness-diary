/**
 * Меню админ-списка клиентов: закрыть / снова открыть направление ПЗ|ТЗ|АЗ.
 * Без React / IDB.
 */

import {
  hasLiveMembershipForHall,
  isHallOpen,
  normalizeLifecycleHall,
} from '../clientHallLifecycleCore.js'
import { normalizeAdminClientsListTab } from './deskHallClientsCore.js'

/**
 * @param {unknown} clientsTab
 * @returns {'pz'|'tz'|'az'}
 */
export function resolveAdminClientsActionHall(clientsTab) {
  const tab = normalizeAdminClientsListTab(clientsTab)
  if (tab === 'tz' || tab === 'az') return tab
  return 'pz'
}

/**
 * @param {unknown} hall
 */
export function adminClientsCloseHallLabel(hall) {
  const h = normalizeLifecycleHall(hall) || 'pz'
  if (h === 'tz') return 'Закрыть ТЗ'
  if (h === 'az') return 'Закрыть АЗ'
  return 'Закрыть ПЗ'
}

/**
 * @param {unknown} hall
 */
export function adminClientsReopenHallLabel(hall) {
  const h = normalizeLifecycleHall(hall) || 'pz'
  if (h === 'tz') return 'Снова ТЗ'
  if (h === 'az') return 'Снова АЗ'
  return 'Снова ПЗ'
}

/**
 * @param {unknown} hall
 * @param {{ leaveClub?: boolean }} [opts]
 */
export function adminClientsCloseHallModalCopy(hall, opts = {}) {
  if (opts.leaveClub) {
    return {
      enterTitle: 'Ушёл из клуба',
      enterConfirmLabel: 'В архив клуба',
      enterHint: 'Закроем все направления и отправим в архив клуба.',
    }
  }
  const h = normalizeLifecycleHall(hall) || 'pz'
  const name = h === 'tz' ? 'ТЗ' : h === 'az' ? 'АЗ' : 'ПЗ'
  return {
    enterTitle: `Закрыть ${name}`,
    enterConfirmLabel: `Закрыть ${name}`,
    enterHint: `Закроем направление ${name}. Если других живых залов нет — клиент попадёт в архив клуба.`,
  }
}

/**
 * @param {{
 *   clientsTab: string,
 *   client: object,
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   asOf?: string,
 * }} p
 */
export function shouldOfferAdminCloseHall(p = {}) {
  const tab = normalizeAdminClientsListTab(p.clientsTab)
  if (tab === 'archive') return false
  if (p.client?.archived_at) return false
  const hall = resolveAdminClientsActionHall(tab)
  return isHallOpen({
    client: p.client,
    memberships: p.memberships,
    lifecycleRows: p.lifecycleRows,
    hall,
    asOf: p.asOf,
  })
}

/**
 * Закрытое направление при живом/ожидающем абоне — «Снова ТЗ/АЗ/ПЗ».
 * @param {{
 *   clientsTab: string,
 *   client: object,
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   asOf?: string,
 * }} p
 */
export function shouldOfferAdminReopenHall(p = {}) {
  const tab = normalizeAdminClientsListTab(p.clientsTab)
  if (tab === 'archive') return false
  if (p.client?.archived_at) return false
  const hall = resolveAdminClientsActionHall(tab)
  if (
    isHallOpen({
      client: p.client,
      memberships: p.memberships,
      lifecycleRows: p.lifecycleRows,
      hall,
      asOf: p.asOf,
    })
  ) {
    return false
  }
  return hasLiveMembershipForHall(p.memberships, hall, p.asOf, p.client)
}
