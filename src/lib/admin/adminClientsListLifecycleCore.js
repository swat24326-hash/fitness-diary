/**
 * Вкладки ПЗ/ТЗ/АЗ с учётом client_hall_lifecycle.
 * Канон: закрыли ПЗ, клиент жив на АЗ — не в списке ПЗ; на карточке/поиске — тоже.
 * Закрытый зал без живого абона — Архив админа (как у тренера), не воронка «Не активные».
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
import { getDb } from '../localDb.js'

/**
 * Строки client_hall_lifecycle клуба из IndexedDB (офлайн, без облака).
 * @param {string} [clubId]
 * @returns {Promise<object[]>}
 */
export async function loadAdminClubLifecycleRowsFromLocal(clubId) {
  const club = String(clubId ?? '').trim()
  try {
    const db = await getDb()
    if (!db.objectStoreNames.contains('client_hall_lifecycle')) return []
    const life = await db.getAll('client_hall_lifecycle')
    if (!club) return life ?? []
    return (life ?? []).filter((r) => String(r?.club_id ?? '') === club)
  } catch {
    return []
  }
}

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
 * Админский «Архив» без `archived_at`: направление закрыли, живого абона нигде нет.
 * Тренер таких уже кладёт в Архив (`closed_at` ПЗ). ПНК не уводим.
 * @param {{
 *   client?: object,
 *   memberships?: object[],
 *   lifecycleRows?: object[],
 *   asOf?: string,
 * }} p
 */
export function isAdminListEffectiveClubArchive(p = {}) {
  if (p.client?.archived_at) return true
  const lifecycle = String(p.client?.lifecycle ?? '')
    .trim()
    .toLowerCase()
  if (lifecycle === 'pnk') return false
  const clientId = String(p.client?.id ?? '').trim()
  if (!clientId) return false

  const asOf = p.asOf ?? todayLocalIso()
  if (
    listOpenHalls({
      client: p.client,
      memberships: p.memberships,
      lifecycleRows: p.lifecycleRows,
      asOf,
    }).length > 0
  ) {
    return false
  }

  let anyClosed = false
  let anyLive = false
  for (const hall of MEMBERSHIP_HALLS) {
    if (isHallLifecycleClosed(findLifecycleRow(p.lifecycleRows, clientId, hall))) anyClosed = true
    if (hasLiveMembershipForHall(p.memberships, hall, asOf, p.client)) anyLive = true
  }
  return anyClosed && !anyLive
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

  const lifecycle = String(p.client?.lifecycle ?? '')
    .trim()
    .toLowerCase()
  if (lifecycle === 'pnk') return false

  // Без живого/ожидающего абона reopen невозможен — не держим на вкладке зала
  // (иначе «Не активные» у админа vs Архив у тренера).
  return !hasLiveMembershipForHall(p.memberships, hall, asOf, p.client)
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
