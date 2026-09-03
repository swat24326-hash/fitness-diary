/**
 * Вкладки списка клиентов: ПЗ / ТЗ / АЗ / Архив.
 * Зал — по memberships.hall (один человек может быть в нескольких вкладках).
 * Legacy: без списка абонов — clients.desk_hall / trainer_id.
 */

import { clientMembershipHallSet } from '../membershipHallCore.js'
import {
  clientAdminVisibleHallSet,
  isAdminListEffectiveClubArchive,
} from './adminClientsListLifecycleCore.js'

/** @typedef {'active'|'tz'|'az'|'archive'} AdminClientsListTab */

/** @typedef {{ lifecycleRows?: object[], asOf?: string }} AdminClientsListLifecycleCtx */

export const ADMIN_CLIENTS_LIST_TABS = ['active', 'tz', 'az', 'archive']

/** Подписи вкладок списка (страница по-прежнему «Клиенты»). */
export const ADMIN_CLIENTS_LIST_TAB_LABELS = {
  active: 'ПЗ',
  tz: 'ТЗ',
  az: 'АЗ',
  archive: 'Архив',
}

/**
 * @param {unknown} raw
 * @returns {'tz'|'az'|null}
 */
export function normalizeDeskHall(raw) {
  const h = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (h === 'tz' || h === 'тз') return 'tz'
  if (h === 'az' || h === 'аз') return 'az'
  return null
}

/**
 * @param {object|null|undefined} client
 */
export function clientDeskHall(client) {
  return normalizeDeskHall(client?.desk_hall)
}

/**
 * Зал CRM-карточки (legacy / match): desk tz|az или pz (есть trainer_id).
 * Для списков предпочтительнее clientMembershipHallSet + memberships.
 * @param {object|null|undefined} client
 * @returns {'pz'|'tz'|'az'|null}
 */
export function clientCrmHallKind(client) {
  const desk = normalizeDeskHall(client?.desk_hall)
  if (desk) return desk
  if (String(client?.trainer_id ?? '').trim()) return 'pz'
  return null
}

/**
 * @param {unknown} tab
 * @returns {AdminClientsListTab}
 */
export function normalizeAdminClientsListTab(tab) {
  const t = String(tab ?? '').trim()
  if (t === 'tz' || t === 'az' || t === 'archive') return t
  return 'active'
}

/**
 * @param {object|null|undefined} client
 * @param {AdminClientsListTab} tab
 * @param {object[]|null|undefined} [memberships]
 * @param {AdminClientsListLifecycleCtx|null|undefined} [lifecycleCtx]
 */
export function clientMatchesAdminListTab(client, tab, memberships, lifecycleCtx) {
  const t = normalizeAdminClientsListTab(tab)
  const archived = Boolean(client?.archived_at)
  const effectiveArchive =
    archived ||
    Boolean(
      lifecycleCtx &&
        isAdminListEffectiveClubArchive({
          client,
          memberships,
          lifecycleRows: lifecycleCtx.lifecycleRows ?? [],
          asOf: lifecycleCtx.asOf,
        }),
    )
  if (t === 'archive') return effectiveArchive
  if (effectiveArchive) return false

  const halls = lifecycleCtx
    ? clientAdminVisibleHallSet({
        client,
        memberships,
        lifecycleRows: lifecycleCtx.lifecycleRows ?? [],
        asOf: lifecycleCtx.asOf,
      })
    : clientMembershipHallSet(client, memberships)

  if (t === 'tz') return halls.has('tz')
  if (t === 'az') return halls.has('az')
  return halls.has('pz')
}

/**
 * @param {object[]|null|undefined} clients
 * @param {AdminClientsListTab} tab
 * @param {Record<string, object[]>|null|undefined} [membershipsByClientId]
 * @param {AdminClientsListLifecycleCtx|null|undefined} [lifecycleCtx]
 */
export function filterClientsByAdminListTab(clients, tab, membershipsByClientId, lifecycleCtx) {
  const byId = membershipsByClientId && typeof membershipsByClientId === 'object' ? membershipsByClientId : null
  return (clients ?? []).filter((c) => {
    const id = c?.id != null ? String(c.id) : ''
    const mems = byId && id ? byId[id] ?? byId[c.id] : undefined
    return clientMatchesAdminListTab(c, tab, mems, lifecycleCtx)
  })
}

/**
 * @param {object[]|null|undefined} clients
 * @param {Record<string, object[]>|null|undefined} [membershipsByClientId]
 * @param {AdminClientsListLifecycleCtx|null|undefined} [lifecycleCtx]
 */
export function countClientsByAdminListTab(clients, membershipsByClientId, lifecycleCtx) {
  const list = clients ?? []
  return {
    active: filterClientsByAdminListTab(list, 'active', membershipsByClientId, lifecycleCtx).length,
    tz: filterClientsByAdminListTab(list, 'tz', membershipsByClientId, lifecycleCtx).length,
    az: filterClientsByAdminListTab(list, 'az', membershipsByClientId, lifecycleCtx).length,
    archive: filterClientsByAdminListTab(list, 'archive', membershipsByClientId, lifecycleCtx).length,
  }
}
