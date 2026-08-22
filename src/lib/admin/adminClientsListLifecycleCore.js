/**
 * Вкладки ПЗ/ТЗ/АЗ с учётом client_hall_lifecycle.
 * Канон: закрыли ПЗ, клиент жив на АЗ — не в списке ПЗ; на карточке/поиске — тоже.
 */

import {
  findLifecycleRow,
  hasLiveMembershipForHall,
  isHallLifecycleClosed,
  isHallOpen,
  listOpenHalls,
  normalizeLifecycleHall,
} from '../clientHallLifecycleCore.js'
import { MEMBERSHIP_HALLS, clientMembershipHallSet } from '../membershipHallCore.js'
import { todayLocalIso } from '../dateRu.js'

/**
 * @param {{
 *   client?: object,
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   asOf?: string,
 * }} p
 * @returns {Set<import('../membershipHallCore.js').MembershipHall>}
 */
export function clientAdminVisibleHallSet(p = {}) {
  const asOf = p.asOf ?? todayLocalIso()
  const base = clientMembershipHallSet(p.client, p.memberships)
  const out = new Set(base)
  for (const hall of base) {
    if (
      shouldHideClientFromHallListTab({
        client: p.client,
        memberships: p.memberships,
        lifecycleRows: p.lifecycleRows,
        hall,
        asOf,
      })
    ) {
      out.delete(hall)
    }
  }
  return out
}

/**
 * @param {{
 *   client?: object,
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   hall: string,
 *   asOf?: string,
 * }} p
 */
export function shouldHideClientFromHallListTab(p = {}) {
  const hall = normalizeLifecycleHall(p.hall)
  const clientId = String(p.client?.id ?? '').trim()
  if (!hall || !clientId) return false

  const row = findLifecycleRow(p.lifecycleRows, clientId, hall)
  if (!isHallLifecycleClosed(row)) return false

  const asOf = p.asOf ?? todayLocalIso()
  for (const other of MEMBERSHIP_HALLS) {
    if (other === hall) continue
    if (
      isHallOpen({
        client: p.client,
        memberships: p.memberships,
        lifecycleRows: p.lifecycleRows,
        hall: other,
        asOf,
      })
    ) {
      return true
    }
  }
  return false
}

/**
 * Закрыть направление: открытый зал ИЛИ исчерпан/просрочен, но formal close ещё не был.
 * @param {{
 *   clientsTab?: string,
 *   client?: object,
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   asOf?: string,
 *   hall: string,
 * }} p
 */
export function shouldOfferAdminCloseDepletedHall(p = {}) {
  const hall = normalizeLifecycleHall(p.hall)
  const clientId = String(p.client?.id ?? '').trim()
  if (!hall || !clientId || p.client?.archived_at) return false

  const row = findLifecycleRow(p.lifecycleRows, clientId, hall)
  if (isHallLifecycleClosed(row)) return false

  const asOf = p.asOf ?? todayLocalIso()
  if (
    isHallOpen({
      client: p.client,
      memberships: p.memberships,
      lifecycleRows: p.lifecycleRows,
      hall,
      asOf,
    })
  ) {
    return false
  }

  const halls = clientMembershipHallSet(p.client, p.memberships)
  if (!halls.has(hall)) return false

  return !hasLiveMembershipForHall(p.memberships, hall, asOf, p.client)
}

/**
 * Стартовая вкладка карточки: сначала открытые залы, не «застрявший» ПЗ по trainer_id.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memberships
 * @param {unknown} preferred
 * @param {{ lifecycleRows?: object[], asOf?: string }|null|undefined} [lifecycleCtx]
 * @returns {'pz'|'tz'|'az'}
 */
export function resolveAdminClientHallTabWithLifecycle(client, memberships, preferred, lifecycleCtx) {
  const want = normalizeLifecycleHall(preferred)
  const lifecycleRows = lifecycleCtx?.lifecycleRows ?? []
  const asOf = lifecycleCtx?.asOf ?? todayLocalIso()
  const visible = clientAdminVisibleHallSet({
    client,
    memberships,
    lifecycleRows,
    asOf,
  })

  if (want && visible.has(want)) {
    return want
  }

  const open = listOpenHalls({ client, memberships, lifecycleRows, asOf })
  if (open.includes('az')) return 'az'
  if (open.includes('tz')) return 'tz'
  if (open.includes('pz')) return 'pz'

  if (visible.has('az')) return 'az'
  if (visible.has('tz')) return 'tz'
  if (visible.has('pz')) return 'pz'
  return 'pz'
}
