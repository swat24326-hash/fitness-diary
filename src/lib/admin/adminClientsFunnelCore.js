/**
 * Фильтры сводки «Клиенты»:
 * - ПЗ / АЗ — срок И занятия (usable = covers + remaining);
 * - ТЗ — только календарь (пакет по сроку, total_trainings часто 0).
 */

import { membershipSignal } from '../clientListSignals.js'
import { hasUpcomingMembership, pickUsableMembershipForDate } from '../membershipRules.js'
import {
  isBirthdayToday,
  isClientStaleForAttention,
  isMembershipExpiredRecently,
  membershipDaysSinceLatestEnd,
  STALE_MAX_DAYS,
  STALE_TRAINING_DAYS,
} from '../trainer/trainerClientOutreachCore.js'
import { deskMembershipSignal } from './deskMembershipLedgerCore.js'

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

/** @typedef {'pz' | 'tz' | 'az'} AdminFunnelHallMode */

/**
 * @param {unknown} raw
 * @param {{ deskMode?: boolean }} [legacy]
 * @returns {AdminFunnelHallMode}
 */
export function normalizeAdminFunnelHallMode(raw, legacy = {}) {
  const h = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (h === 'tz' || h === 'тз') return 'tz'
  if (h === 'az' || h === 'аз') return 'az'
  // legacy: deskMode true = старый «весь desk по календарю» → ТЗ
  if (legacy.deskMode === true) return 'tz'
  return 'pz'
}

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

/** Куплен абонемент со стартом позже сегодня, сегодня usable нет (ПЗ / АЗ). */
export function isAwaitingMembershipStart(memList, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  if (pickUsableMembershipForDate(memList ?? [], today)) return false
  return hasUpcomingMembership(memList ?? [], today)
}

/** ТЗ: ждёт старт по календарю. */
export function isTzAwaitingMembershipStart(memList, todayIso) {
  return deskMembershipSignal(memList, todayIso).key === 'not_started'
}

/** ТЗ: нет действующего по сроку и нет будущего. */
export function isTzClientInactiveToday(memList, todayIso) {
  const key = deskMembershipSignal(memList, todayIso).key
  return key !== 'active' && key !== 'expiring' && key !== 'not_started'
}

/** ТЗ: закончился 0…13 дней назад. */
export function isTzMembershipExpiredRecently(memList, todayIso, staleDays = STALE_TRAINING_DAYS) {
  const today = String(todayIso ?? '').slice(0, 10)
  const threshold = Number(staleDays) > 0 ? Number(staleDays) : STALE_TRAINING_DAYS
  const key = deskMembershipSignal(memList, today).key
  if (key === 'active' || key === 'expiring' || key === 'not_started') return false
  const days = membershipDaysSinceLatestEnd(memList, today)
  if (days == null) return false
  return days >= 0 && days < threshold
}

/** ТЗ: закончился 14…60 дней назад. */
export function isTzClientStaleForAttention(memList, todayIso, opts = {}) {
  const today = String(todayIso ?? '').slice(0, 10)
  const staleDays = Number(opts.staleDays) > 0 ? Number(opts.staleDays) : STALE_TRAINING_DAYS
  const staleMaxDays = Number(opts.staleMaxDays) > 0 ? Number(opts.staleMaxDays) : STALE_MAX_DAYS
  const key = deskMembershipSignal(memList, today).key
  if (key === 'active' || key === 'expiring' || key === 'not_started') return false
  if (isTzMembershipExpiredRecently(memList, today, staleDays)) return false
  const days = membershipDaysSinceLatestEnd(memList, today)
  if (days == null) return false
  return days >= staleDays && days <= staleMaxDays
}

/**
 * АЗ (и локальный расчёт без club inactiveIds): нет usable и не ждёт старт.
 * @param {object[]} memList
 * @param {string} todayIso
 */
export function isSessionLimitedClientInactiveToday(memList, todayIso) {
  const today = String(todayIso ?? '').slice(0, 10)
  if (pickUsableMembershipForDate(memList ?? [], today)) return false
  if (isAwaitingMembershipStart(memList, today)) return false
  return true
}

/** @deprecated имя: ТЗ-календарь; оставлено для старых импортов */
export const isDeskAwaitingMembershipStart = isTzAwaitingMembershipStart
/** @deprecated */
export const isDeskClientInactiveToday = isTzClientInactiveToday
/** @deprecated */
export const isDeskMembershipExpiredRecently = isTzMembershipExpiredRecently
/** @deprecated */
export const isDeskClientStaleForAttention = isTzClientStaleForAttention

/**
 * @param {string} filter
 * @param {{
 *   client?: { id?: string, birth_date?: string | null, lifecycle?: string | null },
 *   memList?: object[],
 *   today?: string,
 *   inactiveIds?: Set<string>,
 *   hallMode?: AdminFunnelHallMode | string,
 *   deskMode?: boolean,
 * }} ctx
 */
export function clientMatchesAdminFunnelFilter(filter, ctx = {}) {
  const mode = normalizeAdminClientQuickFilter(filter)
  const today = String(ctx.today ?? '').slice(0, 10)
  const client = ctx.client ?? {}
  const memList = ctx.memList ?? []
  const id = String(client.id ?? '')
  const hall = normalizeAdminFunnelHallMode(ctx.hallMode, { deskMode: ctx.deskMode })

  if (mode === 'all' || mode === 'none') return true
  if (mode === 'pnk') return hall === 'pz' ? isAdminPnkClient(client) : false
  if (mode === 'birthdays') return isBirthdayToday(client.birth_date, today)

  if (hall === 'tz') {
    if (mode === 'inactive') return isTzClientInactiveToday(memList, today)
    if (mode === 'awaiting_start') return isTzAwaitingMembershipStart(memList, today)
    if (mode === 'expiring') return deskMembershipSignal(memList, today).key === 'expiring'
    if (mode === 'expired_recent') return isTzMembershipExpiredRecently(memList, today)
    if (mode === 'stale') return isTzClientStaleForAttention(memList, today)
    return false
  }

  // ПЗ и АЗ: срок + занятия
  if (mode === 'inactive') {
    if (hall === 'az') return isSessionLimitedClientInactiveToday(memList, today)
    return Boolean(ctx.inactiveIds?.has(id))
  }
  if (mode === 'awaiting_start') return isAwaitingMembershipStart(memList, today)
  if (mode === 'expiring') return membershipSignal(memList, today).key === 'expiring'
  if (mode === 'expired_recent') return isMembershipExpiredRecently(memList, today)
  if (mode === 'stale') return isClientStaleForAttention({ memList, today })
  return false
}

/**
 * @param {object[]} clients
 * @param {Record<string, object[]>} memByClient
 * @param {string} today
 * @param {Set<string>} [inactiveIds]
 * @param {{ hallMode?: AdminFunnelHallMode | string, deskMode?: boolean }} [opts]
 */
export function countAdminFunnelFilters(clients, memByClient, today, inactiveIds, opts = {}) {
  const hall = normalizeAdminFunnelHallMode(opts.hallMode, { deskMode: opts.deskMode })
  const hidePnk = hall === 'tz' || hall === 'az'
  let birthdays = 0
  let awaiting_start = 0
  let expiring = 0
  let expired_recent = 0
  let stale = 0
  let pnk = 0
  let inactive = 0
  let all = 0
  for (const c of clients ?? []) {
    const memList = memByClient[c.id] ?? memByClient[String(c.id)] ?? []
    const ctx = { client: c, memList, today, inactiveIds, hallMode: hall }
    if (!isAdminPnkClient(c)) all++
    if (clientMatchesAdminFunnelFilter('pnk', ctx)) pnk++
    if (clientMatchesAdminFunnelFilter('inactive', ctx)) inactive++
    if (clientMatchesAdminFunnelFilter('birthdays', ctx)) birthdays++
    if (clientMatchesAdminFunnelFilter('awaiting_start', ctx)) awaiting_start++
    if (clientMatchesAdminFunnelFilter('expiring', ctx)) expiring++
    if (clientMatchesAdminFunnelFilter('expired_recent', ctx)) expired_recent++
    if (clientMatchesAdminFunnelFilter('stale', ctx)) stale++
  }
  return {
    all,
    pnk: hidePnk ? 0 : pnk,
    inactive,
    birthdays,
    awaiting_start,
    expiring,
    expired_recent,
    stale,
  }
}
