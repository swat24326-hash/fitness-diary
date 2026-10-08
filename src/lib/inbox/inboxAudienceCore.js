/**
 * Кто может рассылать и кому дойдёт. Админ — любые клубы; управляющий — только свой.
 * Получатель — клиент выбранного клуба, не в архиве, со входом в приложение;
 * фильтр зала — открытое направление (то же правило, что в списках клиентов: listOpenHalls).
 */
import { listOpenHalls } from '../clientHallLifecycleCore.js'
import { USERS_SALES_MANAGER_ROLES, USERS_SUPERVISOR_ROLES, USERS_TRAINER_ROLES } from '../userRoleConstants.js'

export const INBOX_NO_ACCESS_RU = 'Рассылки доступны администратору и управляющему'
export const INBOX_SUPERVISOR_CLUB_RU = 'Управляющий отправляет только в свой клуб'
export const INBOX_SUPERVISOR_NO_CLUB_RU = 'У управляющего не задан клуб — обратитесь к администратору'

/**
 * @param {{ isAdmin?: boolean, isSupervisor?: boolean, profile?: { club_id?: string } }} ctx
 * @param {string[]} requested уже нормализованные id клубов
 * @returns {{ ok: true, clubIds: string[] } | { ok: false, status: number, error: string }}
 */
export function resolveInboxClubScope(ctx, requested) {
  const want = [...new Set((requested ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
  if (ctx?.isAdmin) return { ok: true, clubIds: want }
  if (!ctx?.isSupervisor) return { ok: false, status: 403, error: INBOX_NO_ACCESS_RU }
  const own = String(ctx.profile?.club_id ?? '').trim()
  if (!own) return { ok: false, status: 403, error: INBOX_SUPERVISOR_NO_CLUB_RU }
  if (want.some((id) => id !== own)) return { ok: false, status: 403, error: INBOX_SUPERVISOR_CLUB_RU }
  return { ok: true, clubIds: [own] }
}

/** Видит ли сотрудник рассылку: админ — все, управляющий — где есть его клуб. */
export function canViewInboxCampaign(ctx, campaign) {
  if (ctx?.isAdmin) return true
  if (!ctx?.isSupervisor) return false
  const own = String(ctx.profile?.club_id ?? '').trim()
  return Boolean(own) && (campaign?.club_ids ?? []).map(String).includes(own)
}

/** Закрыть досрочно: админ — любую, управляющий — только рассылку одного своего клуба. */
export function canCloseInboxCampaign(ctx, campaign) {
  if (ctx?.isAdmin) return true
  if (!canViewInboxCampaign(ctx, campaign)) return false
  return (campaign?.club_ids ?? []).length === 1
}

/** Управляющему в итогах — только доставки его клуба. */
export function inboxDeliveryClubFilter(ctx) {
  if (ctx?.isAdmin) return null
  return String(ctx?.profile?.club_id ?? '').trim() || null
}

const STAFF_ROLE_VALUES = Object.freeze({
  trainer: USERS_TRAINER_ROLES,
  sales: USERS_SALES_MANAGER_ROLES,
  supervisor: USERS_SUPERVISOR_ROLES,
})

/** users.role → ключ рассылки; пустая или чужая роль — null (такому не шлём). */
export function inboxStaffRoleOf(roleRaw) {
  const role = String(roleRaw ?? '').trim().toLowerCase()
  if (!role) return null
  for (const [key, values] of Object.entries(STAFF_ROLE_VALUES)) if (values.includes(role)) return key
  return null
}

/** Все значения users.role для фильтра в запросе по выбранным ключам. */
export function inboxStaffRoleValues(roles) {
  return (roles ?? []).flatMap((r) => STAFF_ROLE_VALUES[r] ?? [])
}

/** Получатель «Входящих» сотрудника — тренер, менеджер продаж или управляющий. */
export function isInboxStaffRecipient(ctx) {
  return Boolean(ctx?.isTrainer || ctx?.isSalesManager || ctx?.isSupervisor)
}

/**
 * Сотрудники выбранных клубов с нужной ролью; отключённых и самого отправителя пропускаем.
 * @param {{ users: Array<{ id: string, club_id?: string, role?: string, is_active?: boolean|null }>, roles: string[], excludeUserId?: string }} p
 * @returns {{ matched: number, recipients: Array<{ user_id: string, club_id: string }> }}
 */
export function pickInboxStaffRecipients(p) {
  const roles = new Set(p.roles ?? [])
  const skip = String(p.excludeUserId ?? '')
  const recipients = []
  for (const u of p.users ?? []) {
    if (u?.is_active === false || String(u?.id) === skip) continue
    if (!roles.has(inboxStaffRoleOf(u.role))) continue
    recipients.push({ user_id: String(u.id), club_id: String(u.club_id ?? '') })
  }
  return { matched: recipients.length, recipients }
}

/**
 * @param {{
 *   clients: Array<{ id: string, club_id: string, archived_at?: string|null }>,
 *   membershipsByClient: Map<string, object[]>,
 *   lifecycleRows: object[],
 *   liveClientIds: Set<string>,
 *   halls: string[],
 *   asOf: string,
 * }} p
 * @returns {{ matched: number, recipients: Array<{ client_id: string, club_id: string }> }}
 */
export function pickInboxRecipients(p) {
  const halls = p.halls ?? []
  let matched = 0
  const recipients = []
  for (const client of p.clients ?? []) {
    if (client?.archived_at) continue
    const id = String(client.id)
    if (halls.length) {
      const open = listOpenHalls({
        client,
        memberships: p.membershipsByClient.get(id) ?? [],
        lifecycleRows: p.lifecycleRows ?? [],
        asOf: p.asOf,
      })
      if (!open.some((h) => halls.includes(h))) continue
    }
    matched += 1
    if (p.liveClientIds.has(id)) recipients.push({ client_id: id, club_id: String(client.club_id ?? '') })
  }
  return { matched, recipients }
}
