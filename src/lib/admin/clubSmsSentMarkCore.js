/**
 * Отметка «SMS уже слали» в списке клиентов админки.
 *
 * Длинные окна (как длительность корзины / каденс):
 * - Истекает: MEMBERSHIP_EXPIRING_WITHIN_DAYS (сейчас 5)
 * - Закончился (0–13 дн.): 14 дней
 * - Давно не был (фильтр 14–60 дн.): отметка 14 дней (повторное касание, не «навсегда»)
 *
 * В узком фильтре воронки — отметка по сценарию этого фильтра.
 * В «Все» / «Не активные» / др. — если у клиента горит отметка его *текущей* корзины,
 * либо любая SMS за сегодня.
 */

import { membershipSignal, MEMBERSHIP_EXPIRING_WITHIN_DAYS } from '../clientListSignals.js'
import {
  isBirthdayToday,
  isClientStaleForAttention,
  isMembershipExpiredRecently,
  STALE_TRAINING_DAYS,
} from '../trainer/trainerClientOutreachCore.js'

/** @type {Record<string, number>} */
export const CLUB_SMS_MARK_WINDOW_DAYS = {
  expiring: MEMBERSHIP_EXPIRING_WITHIN_DAYS,
  expired_recent: STALE_TRAINING_DAYS,
  stale: STALE_TRAINING_DAYS,
}

/** Фильтры, где отметка живёт дольше суток. */
export function isExtendedClubSmsMarkFilter(filter) {
  return Object.prototype.hasOwnProperty.call(CLUB_SMS_MARK_WINDOW_DAYS, String(filter ?? ''))
}

/** @param {string | null | undefined} filter */
export function clubSmsMarkTtlDays(filter) {
  const f = String(filter ?? '')
  if (isExtendedClubSmsMarkFilter(f)) return CLUB_SMS_MARK_WINDOW_DAYS[f]
  return 1
}

/**
 * Фактическая корзина клиента для журнала SMS (не «что на экране»).
 * Приоритет: ДР → истекает → закончился → давно не был → custom.
 *
 * @param {{
 *   client?: { birth_date?: string | null },
 *   memList?: object[],
 *   today?: string,
 * }} ctx
 * @returns {'birthdays'|'expiring'|'expired_recent'|'stale'|'custom'}
 */
export function resolveClientClubSmsScenario(ctx = {}) {
  const today = String(ctx.today ?? '').slice(0, 10)
  const memList = ctx.memList ?? []
  const client = ctx.client ?? {}
  if (today && isBirthdayToday(client.birth_date, today)) return 'birthdays'
  if (membershipSignal(memList, today).key === 'expiring') return 'expiring'
  if (isMembershipExpiredRecently(memList, today)) return 'expired_recent'
  if (isClientStaleForAttention({ memList, today })) return 'stale'
  return 'custom'
}

/**
 * Сценарий для записи в журнал: шаблон фильтра, иначе корзина клиента.
 * @param {{
 *   mode?: 'template' | 'custom',
 *   scenario?: string | null,
 *   client?: object,
 *   memList?: object[],
 *   today?: string,
 * }} opts
 */
export function resolveClubSmsLogScenario(opts = {}) {
  if (opts.mode === 'template' && opts.scenario) return String(opts.scenario)
  return resolveClientClubSmsScenario({
    client: opts.client,
    memList: opts.memList,
    today: opts.today,
  })
}

/**
 * Целые календарные дни между двумя ISO-датами (to − from).
 * @param {string} fromIso
 * @param {string} toIso
 */
export function calendarDaysBetween(fromIso, toIso) {
  const a = String(fromIso ?? '').slice(0, 10)
  const b = String(toIso ?? '').slice(0, 10)
  const ma = a.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const mb = b.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!ma || !mb) return Number.POSITIVE_INFINITY
  const da = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]))
  const db = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]))
  return Math.round((db - da) / 86400000)
}

/**
 * Запись ещё «горит» для данного сценария (по TTL сценария).
 * @param {{ scenario?: string, created_at?: string } | null | undefined} entry
 * @param {string} today
 * @param {string} [scenarioForTtl] если задан — TTL берём от него
 */
export function clubSmsLogStillActive(entry, today, scenarioForTtl) {
  if (!entry) return false
  const day = String(today ?? '').slice(0, 10)
  const atDay = String(entry.created_at ?? '').slice(0, 10)
  if (!day || !atDay) return false
  const age = calendarDaysBetween(atDay, day)
  if (age < 0) return false
  const scenario = String(scenarioForTtl ?? entry.scenario ?? 'custom')
  return age < clubSmsMarkTtlDays(scenario)
}

/**
 * Показывать ли отметку в текущем фильтре списка.
 *
 * @param {{ scenario?: string, created_at?: string } | null | undefined} entry
 * @param {{
 *   today: string,
 *   viewingFilter: string,
 *   clientScenario?: string | null,
 * }} ctx
 */
export function clubSmsLogMarksInFilter(entry, ctx) {
  if (!entry) return false
  const today = String(ctx.today ?? '').slice(0, 10)
  const filter = String(ctx.viewingFilter ?? '').trim() || 'all'
  const scenario = String(entry.scenario ?? 'custom')
  const clientScenario = ctx.clientScenario != null ? String(ctx.clientScenario) : null

  if (!clubSmsLogStillActive(entry, today, scenario)) return false

  // Узкий фильтр воронки / ДР: только свой сценарий.
  if (isExtendedClubSmsMarkFilter(filter) || filter === 'birthdays') {
    return scenario === filter
  }

  // Широкий вид (Все, неактивные, ждёт старт, поиск…):
  // 1) любая SMS сегодня
  // 2) или горит отметка текущей корзины клиента
  const atDay = String(entry.created_at ?? '').slice(0, 10)
  if (atDay === today) return true
  if (clientScenario && scenario === clientScenario && isExtendedClubSmsMarkFilter(clientScenario)) {
    return true
  }
  return false
}

/**
 * @param {Array<{ client_id?: string, scenario?: string, created_at?: string }>} logs
 * @param {{
 *   today: string,
 *   viewingFilter: string,
 *   clientScenarioById?: Record<string, string> | Map<string, string>,
 * }} ctx
 * @returns {Map<string, { at: string, scenario: string }>}
 */
export function mapClubSmsMarksByClient(logs, ctx) {
  /** @type {Map<string, { at: string, scenario: string }>} */
  const out = new Map()
  const scenarioMap = ctx.clientScenarioById ?? {}
  const getScenario = (id) => {
    if (scenarioMap instanceof Map) return scenarioMap.get(id) ?? null
    return scenarioMap[id] ?? scenarioMap[String(id)] ?? null
  }

  for (const row of logs ?? []) {
    const clientId = String(row?.client_id ?? '').trim()
    if (!clientId) continue
    if (
      !clubSmsLogMarksInFilter(row, {
        today: ctx.today,
        viewingFilter: ctx.viewingFilter,
        clientScenario: getScenario(clientId),
      })
    ) {
      continue
    }
    const at = String(row.created_at ?? '')
    const prev = out.get(clientId)
    if (!prev || at > prev.at) {
      out.set(clientId, { at, scenario: String(row.scenario ?? 'custom') })
    }
  }
  return out
}

/**
 * Подпись на чипе.
 * @param {string | null | undefined} viewingFilter
 * @param {string | null | undefined} markScenario
 */
export function clubSmsMarkChipLabel(viewingFilter, markScenario) {
  if (isExtendedClubSmsMarkFilter(markScenario) || isExtendedClubSmsMarkFilter(viewingFilter)) {
    return 'уже'
  }
  return 'сегодня'
}

/**
 * @param {string | null | undefined} markScenario
 * @param {string | null | undefined} viewingFilter
 */
export function clubSmsMarkTitle(markScenario, viewingFilter) {
  const s = String(markScenario ?? '')
  if (isExtendedClubSmsMarkFilter(s)) {
    const days = clubSmsMarkTtlDays(s)
    return `SMS уже отправлено (отметка до ${days} дн. в этом касании)`
  }
  if (isExtendedClubSmsMarkFilter(viewingFilter)) {
    return `SMS уже отправлено в этом списке (отметка до ${clubSmsMarkTtlDays(viewingFilter)} дн.)`
  }
  return 'SMS отправлено сегодня с этого устройства'
}
