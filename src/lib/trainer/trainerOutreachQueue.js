import { membershipSignal } from '../clientListSignals.js'
import { todayLocalIso } from '../dateRu.js'
import {
  isBirthdayToday,
  isMembershipExpiredRecently,
  membershipDaysUntilEnd,
  pickLatestEndedMembership,
  STALE_TRAINING_DAYS,
  daysSinceIsoDate,
  isClientStaleForAttention,
} from './trainerClientOutreachCore.js'

/** Порядок важности — один клиент = одно сообщение в день. */
export const OUTREACH_SCENARIO_PRIORITY = ['birthdays', 'expiring', 'expired_recent', 'stale']

/**
 * Главный сценарий outreach для клиента (без пересечений в счётчиках).
 * @param {{
 *   client?: object,
 *   memList?: object[],
 *   today?: string,
 *   staleDays?: number,
 * }} ctx
 * @returns {import('./trainerClientOutreachCore.js').OutreachScenario | null}
 */
export function resolvePrimaryOutreachScenarioForClient(ctx = {}) {
  const today = String(ctx.today ?? todayLocalIso())
  const staleDays = Number(ctx.staleDays) > 0 ? Number(ctx.staleDays) : STALE_TRAINING_DAYS
  const memList = ctx.memList ?? []
  const client = ctx.client ?? {}

  if (isBirthdayToday(client.birth_date, today)) return 'birthdays'
  if (membershipSignal(memList, today).key === 'expiring') return 'expiring'
  if (isMembershipExpiredRecently(memList, today)) return 'expired_recent'
  if (isClientStaleForAttention({ memList, today, staleDays })) return 'stale'
  return null
}

/** @param {string} scenario @param {object[]} memList @param {string} today */
export function buildOutreachScenarioHint(scenario, memList, today = todayLocalIso()) {
  const mem = memList ?? []
  if (scenario === 'birthdays') return 'День рождения сегодня'
  if (scenario === 'expiring') {
    const days = membershipDaysUntilEnd(mem, today)
    if (days == null) return 'Истекает скоро'
    if (days <= 0) return 'Истекает сегодня'
    return `Истекает через ${days} дн.`
  }
  const ended = pickLatestEndedMembership(mem, today)
  const daysSinceEnd = ended ? daysSinceIsoDate(ended.end_date, today) : null
  if (scenario === 'expired_recent') {
    if (daysSinceEnd == null) return 'Абонемент закончился'
    if (daysSinceEnd === 0) return 'Закончился сегодня'
    if (daysSinceEnd === 1) return 'Закончился вчера'
    return `Закончился ${daysSinceEnd} дн. назад`
  }
  if (scenario === 'stale') {
    if (daysSinceEnd == null) return 'Давно без абонемента'
    return `Без абонемента ${daysSinceEnd} дн.`
  }
  return ''
}

/**
 * @param {object} client
 * @param {string} scenario
 * @param {object[]} memList
 * @param {string} today
 */
export function outreachClientSortKey(client, scenario, memList, today = todayLocalIso()) {
  const hasMaxLink = Boolean(String(client?.max_chat_url ?? '').trim())
  const hasPhone = Boolean(String(client?.phone ?? '').trim())
  let urgency = 9999

  if (scenario === 'expiring') {
    const days = membershipDaysUntilEnd(memList ?? [], today)
    urgency = days != null ? days : 999
  } else if (scenario === 'expired_recent' || scenario === 'stale') {
    const ended = pickLatestEndedMembership(memList ?? [], today)
    const days = ended ? daysSinceIsoDate(ended.end_date, today) : null
    urgency = days != null ? days : 9999
    if (scenario === 'stale') urgency = -urgency
  } else if (scenario === 'birthdays') {
    urgency = 0
  }

  return {
    urgency,
    hasMaxLink: hasMaxLink ? 0 : 1,
    hasPhone: hasPhone ? 0 : 1,
    name: String(client?.name ?? '').toLowerCase(),
  }
}

/**
 * @param {object[]} clients
 * @param {string} scenario
 * @param {Record<string, object[]>} memByClient
 * @param {Set<string>} sentTodayIds
 * @param {string} [today]
 */
export function sortClientsForOutreachFilter(clients, scenario, memByClient, sentTodayIds, today = todayLocalIso()) {
  const list = [...(clients ?? [])]
  list.sort((a, b) => {
    const aSent = sentTodayIds.has(String(a.id)) ? 1 : 0
    const bSent = sentTodayIds.has(String(b.id)) ? 1 : 0
    if (aSent !== bSent) return aSent - bSent

    const ka = outreachClientSortKey(a, scenario, memByClient[a.id] ?? [], today)
    const kb = outreachClientSortKey(b, scenario, memByClient[b.id] ?? [], today)
    if (ka.hasPhone !== kb.hasPhone) return ka.hasPhone - kb.hasPhone
    if (ka.hasMaxLink !== kb.hasMaxLink) return ka.hasMaxLink - kb.hasMaxLink
    if (ka.urgency !== kb.urgency) return ka.urgency - kb.urgency
    return ka.name.localeCompare(kb.name, 'ru')
  })
  return list
}

/**
 * @param {object[]} clients — уже отфильтрованные и отсортированные
 * @param {Set<string>} sentTodayIds
 */
export function pickNextOutreachClient(clients, sentTodayIds) {
  for (const c of clients ?? []) {
    if (!String(c?.phone ?? '').trim()) continue
    if (sentTodayIds.has(String(c.id))) continue
    return c
  }
  return null
}

/**
 * Сводка по главному сценарию на клиента (без двойного счёта).
 * @param {{
 *   clients?: object[],
 *   memByClient?: Record<string, object[]>,
 *   today?: string,
 *   staleDays?: number,
 * }} input
 */
export function buildTrainerAttentionSummaryByPrimaryScenario(input = {}) {
  const today = String(input.today ?? todayLocalIso())
  const staleDays = Number(input.staleDays) > 0 ? Number(input.staleDays) : STALE_TRAINING_DAYS
  const memByClient = input.memByClient ?? {}

  let birthdays = 0
  let expiring = 0
  let expired_recent = 0
  let stale = 0

  for (const c of input.clients ?? []) {
    if (c?.archived_at) continue
    const primary = resolvePrimaryOutreachScenarioForClient({
      client: c,
      memList: memByClient[c.id] ?? [],
      today,
      staleDays,
    })
    if (primary === 'birthdays') birthdays++
    else if (primary === 'expiring') expiring++
    else if (primary === 'expired_recent') expired_recent++
    else if (primary === 'stale') stale++
  }

  return {
    birthdays,
    expiring,
    expired_recent,
    stale,
    actionable: birthdays + expiring + expired_recent + stale,
    staleDays,
  }
}
