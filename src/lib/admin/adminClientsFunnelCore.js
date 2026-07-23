/**
 * Фильтры сводки «Клиенты» админки: воронка как у тренера + неактивные + ждёт старт.
 */

import { membershipSignal } from '../clientListSignals.js'
import { hasUpcomingMembership, pickUsableMembershipForDate } from '../membershipRules.js'
import {
  isBirthdayToday,
  isClientStaleForAttention,
  isMembershipExpiredRecently,
} from '../trainer/trainerClientOutreachCore.js'

export const ADMIN_CLIENT_FUNNEL_FILTERS = [
  'all',
  'inactive',
  'pnk',
  'awaiting_start',
  'birthdays',
  'expiring',
  'expired_recent',
  'stale',
]

/** Старые URL → актуальный фильтр. */
export function normalizeAdminClientQuickFilter(raw) {
  const f = String(raw ?? '').trim()
  if (!f || f === 'none') return 'none'
  if (f === 'expired_remaining') return 'expired_recent'
  if (f === 'active_today') return 'none'
  return f
}

/** Открытая карточка воронки ПНК (не отказ). */
export function isAdminPnkClient(client) {
  return String(client?.lifecycle ?? '') === 'pnk'
}

/** Куплен абонемент со стартом позже сегодня, сегодня usable нет. */
export function isAwaitingMembershipStart(memList, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  if (pickUsableMembershipForDate(memList ?? [], today)) return false
  return hasUpcomingMembership(memList ?? [], today)
}

/**
 * @param {string} filter
 * @param {{
 *   client?: { id?: string, birth_date?: string | null, lifecycle?: string | null },
 *   memList?: object[],
 *   today?: string,
 *   inactiveIds?: Set<string>,
 * }} ctx
 */
export function clientMatchesAdminFunnelFilter(filter, ctx = {}) {
  const mode = normalizeAdminClientQuickFilter(filter)
  const today = String(ctx.today ?? '').slice(0, 10)
  const client = ctx.client ?? {}
  const memList = ctx.memList ?? []
  const id = String(client.id ?? '')

  if (mode === 'all' || mode === 'none') return true
  if (mode === 'inactive') return Boolean(ctx.inactiveIds?.has(id))
  if (mode === 'pnk') return isAdminPnkClient(client)
  if (mode === 'awaiting_start') return isAwaitingMembershipStart(memList, today)
  if (mode === 'birthdays') return isBirthdayToday(client.birth_date, today)
  if (mode === 'expiring') return membershipSignal(memList, today).key === 'expiring'
  if (mode === 'expired_recent') return isMembershipExpiredRecently(memList, today)
  if (mode === 'stale') return isClientStaleForAttention({ memList, today })
  return false
}

/**
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} today
 * @param {Set<string>} inactiveIds
 */
export function countAdminFunnelFilters(clients, memByClient, today, inactiveIds) {
  let birthdays = 0
  let awaiting_start = 0
  let expiring = 0
  let expired_recent = 0
  let stale = 0
  let pnk = 0
  for (const c of clients ?? []) {
    const memList = memByClient[c.id] ?? memByClient[String(c.id)] ?? []
    const ctx = { client: c, memList, today, inactiveIds }
    if (clientMatchesAdminFunnelFilter('pnk', ctx)) pnk++
    if (clientMatchesAdminFunnelFilter('birthdays', ctx)) birthdays++
    if (clientMatchesAdminFunnelFilter('awaiting_start', ctx)) awaiting_start++
    if (clientMatchesAdminFunnelFilter('expiring', ctx)) expiring++
    if (clientMatchesAdminFunnelFilter('expired_recent', ctx)) expired_recent++
    if (clientMatchesAdminFunnelFilter('stale', ctx)) stale++
  }
  return {
    pnk,
    birthdays,
    awaiting_start,
    expiring,
    expired_recent,
    stale,
    inactive: inactiveIds?.size ?? 0,
  }
}
