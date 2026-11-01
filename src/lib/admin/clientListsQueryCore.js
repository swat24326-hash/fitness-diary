/**
 * Конструктор списков клиентов (замена операционных выгрузок 1С).
 * Живые / архив × залы × признак (ДР, истекает, недавно истёк) × период архива.
 */

import { isBirthdayToday, isBirthdayWithinNextDays } from '../clientBirthdays.js'
import { todayLocalIso } from '../dateRu.js'
import { clientAdminVisibleHallSet } from './adminClientsListLifecycleCore.js'
import { archiveClientHall } from './adminClientsArchiveHallCore.js'
import { clientMatchesAdminFunnelFilter } from './adminClientsFunnelCore.js'
import {
  clientMatchesAdminListTab,
  normalizeAdminClientsListTab,
} from './deskHallClientsCore.js'

/** @typedef {'live'|'archive'} ClientListsPool */
/** @typedef {'all'|'birthdays'|'expiring'|'expired_recent'} ClientListsCriterion */
/** @typedef {'pz'|'tz'|'az'} ClientListsHall */

export const CLIENT_LISTS_POOLS = Object.freeze(['live', 'archive'])
export const CLIENT_LISTS_CRITERIA = Object.freeze(['all', 'birthdays', 'expiring', 'expired_recent'])
export const CLIENT_LISTS_HALLS = Object.freeze(['pz', 'tz', 'az'])

export const CLIENT_LISTS_POOL_LABELS = Object.freeze({
  live: 'Живые',
  archive: 'Архив',
})

export const CLIENT_LISTS_CRITERION_LABELS = Object.freeze({
  all: 'Все по залу',
  birthdays: 'Дни рождения',
  expiring: 'Истекает абонемент',
  expired_recent: 'Недавно истёк',
})

export const CLIENT_LISTS_HALL_LABELS = Object.freeze({
  pz: 'ПЗ',
  tz: 'ТЗ',
  az: 'АЗ',
})

/**
 * @param {unknown} raw
 * @returns {ClientListsPool}
 */
export function normalizeClientListsPool(raw) {
  return String(raw ?? '').trim().toLowerCase() === 'archive' ? 'archive' : 'live'
}

/**
 * @param {unknown} raw
 * @returns {ClientListsCriterion}
 */
export function normalizeClientListsCriterion(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'birthdays' || s === 'др' || s === 'birthday') return 'birthdays'
  if (s === 'expiring' || s === 'истекает') return 'expiring'
  if (s === 'expired_recent' || s === 'expired' || s === 'истёк' || s === 'истек') return 'expired_recent'
  return 'all'
}

/**
 * @param {unknown} raw
 * @returns {ClientListsHall | null}
 */
export function normalizeClientListsHall(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
  if (s === 'pz' || s === 'пз' || s === 'active') return 'pz'
  if (s === 'tz' || s === 'тз') return 'tz'
  if (s === 'az' || s === 'аз') return 'az'
  return null
}

/**
 * Пустой / «все» → все три зала. Иначе уникальный порядок pz→tz→az.
 * @param {unknown} raw
 * @returns {ClientListsHall[]}
 */
export function normalizeClientListsHalls(raw) {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;\s]+/)
      : raw == null
        ? []
        : [raw]
  const set = new Set()
  for (const item of list) {
    const h = normalizeClientListsHall(item)
    if (h) set.add(h)
  }
  if (!set.size) return [...CLIENT_LISTS_HALLS]
  return CLIENT_LISTS_HALLS.filter((h) => set.has(h))
}

/**
 * @param {unknown} raw
 * @param {number} [fallback]
 */
export function normalizeClientListsBirthdayDays(raw, fallback = 30) {
  if (raw === 0 || raw === '0') return 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.min(366, Math.floor(n))
}

/**
 * @param {unknown} raw
 * @returns {string | null} YYYY-MM-DD
 */
export function normalizeClientListsIsoDate(raw) {
  const s = String(raw ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/**
 * @param {unknown} raw
 */
export function normalizeClientListsQuery(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    pool: normalizeClientListsPool(src.pool),
    halls: normalizeClientListsHalls(src.halls),
    criterion: normalizeClientListsCriterion(src.criterion),
    birthdayDays: normalizeClientListsBirthdayDays(src.birthdayDays ?? src.birthday_days),
    archiveFrom: normalizeClientListsIsoDate(src.archiveFrom ?? src.archive_from),
    archiveTo: normalizeClientListsIsoDate(src.archiveTo ?? src.archive_to),
    today: normalizeClientListsIsoDate(src.today) || todayLocalIso(),
  }
}

/** Ключи фильтра конструктора в URL (без club/from). */
export const CLIENT_LISTS_QS_KEYS = Object.freeze([
  'pool',
  'halls',
  'criterion',
  'bday',
  'archFrom',
  'archTo',
])

/**
 * @param {ReturnType<typeof normalizeClientListsQuery> | object} query
 * @returns {URLSearchParams}
 */
export function buildClientListsSearchParams(query = {}) {
  const q = normalizeClientListsQuery(query)
  const qs = new URLSearchParams()
  if (q.pool !== 'live') qs.set('pool', q.pool)
  const allHalls = q.halls.length === CLIENT_LISTS_HALLS.length
  if (!allHalls) qs.set('halls', q.halls.join(','))
  if (q.criterion !== 'all') qs.set('criterion', q.criterion)
  if (q.criterion === 'birthdays' && q.birthdayDays !== 30) qs.set('bday', String(q.birthdayDays))
  if (q.archiveFrom) qs.set('archFrom', q.archiveFrom)
  if (q.archiveTo) qs.set('archTo', q.archiveTo)
  return qs
}

/**
 * @param {URLSearchParams | string | null | undefined} source
 */
export function parseClientListsSearchParams(source) {
  let src
  if (source instanceof URLSearchParams) src = source
  else if (typeof source === 'string') src = new URLSearchParams(source.startsWith('?') ? source.slice(1) : source)
  else src = new URLSearchParams()
  return normalizeClientListsQuery({
    pool: src.get('pool'),
    halls: src.get('halls'),
    criterion: src.get('criterion'),
    birthdayDays: src.get('bday'),
    archiveFrom: src.get('archFrom'),
    archiveTo: src.get('archTo'),
  })
}

/**
 * @param {string | null | undefined} archivedAt
 * @returns {string | null}
 */
export function clientArchivedOnIso(archivedAt) {
  const s = String(archivedAt ?? '').trim()
  if (!s) return null
  const day = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/**
 * @param {string | null} day
 * @param {string | null} from
 * @param {string | null} to
 */
export function isoDayInInclusiveRange(day, from, to) {
  if (!day) return false
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

/**
 * @param {object} client
 * @param {object[]} memList
 * @param {ClientListsHall[]} halls
 * @param {{ lifecycleRows?: object[], asOf?: string }} [lifecycleCtx]
 * @returns {ClientListsHall[]}
 */
export function clientListsMatchedHalls(client, memList, halls, lifecycleCtx) {
  const want = normalizeClientListsHalls(halls)
  const out = []
  for (const hall of want) {
    if (client?.archived_at) {
      if (archiveClientHall(client, memList) === hall) out.push(hall)
      continue
    }
    if (lifecycleCtx) {
      const open = clientAdminVisibleHallSet({
        client,
        memberships: memList,
        lifecycleRows: lifecycleCtx.lifecycleRows ?? [],
        asOf: lifecycleCtx.asOf,
      })
      if (open.has(hall)) out.push(hall)
      continue
    }
    const tab = hall === 'pz' ? 'active' : hall
    if (clientMatchesAdminListTab(client, normalizeAdminClientsListTab(tab), memList)) out.push(hall)
  }
  return out
}

/**
 * @param {object} client
 * @param {object[]} memList
 * @param {ReturnType<typeof normalizeClientListsQuery>} query
 * @param {ClientListsHall[]} matchedHalls
 */
export function clientMatchesListCriterion(client, memList, query, matchedHalls) {
  const q = normalizeClientListsQuery(query)
  if (q.criterion === 'all') return matchedHalls.length > 0
  if (q.criterion === 'birthdays') {
    if (q.birthdayDays === 0) return isBirthdayToday(client?.birth_date, q.today)
    return isBirthdayWithinNextDays(client?.birth_date, q.today, q.birthdayDays)
  }
  for (const hall of matchedHalls) {
    if (
      clientMatchesAdminFunnelFilter(q.criterion, {
        client,
        memList,
        today: q.today,
        hallMode: hall,
      })
    ) {
      return true
    }
  }
  return false
}

/**
 * @param {{
 *   clients?: object[],
 *   memByClient?: Record<string, object[]>,
 *   lifecycleRows?: object[],
 *   query?: object,
 * }} input
 * @returns {{ rows: object[], count: number, query: ReturnType<typeof normalizeClientListsQuery> }}
 */
export function queryClientLists(input = {}) {
  const query = normalizeClientListsQuery(input.query)
  const memBy = input.memByClient && typeof input.memByClient === 'object' ? input.memByClient : {}
  const lifecycleRows = Array.isArray(input.lifecycleRows) ? input.lifecycleRows : []
  const lifecycleCtx = { lifecycleRows, asOf: query.today }
  const rows = []

  for (const client of input.clients ?? []) {
    if (!client || typeof client !== 'object') continue
    const id = String(client.id ?? '').trim()
    if (!id) continue

    const inArchiveTab = clientMatchesAdminListTab(client, 'archive', memBy[id] ?? [], lifecycleCtx)
    if (query.pool === 'archive') {
      if (!inArchiveTab) continue
      const archivedOn = clientArchivedOnIso(client.archived_at)
      if (query.archiveFrom || query.archiveTo) {
        // Эффективный архив без archived_at (закрыты все залы) — в период не попадает.
        if (!isoDayInInclusiveRange(archivedOn, query.archiveFrom, query.archiveTo)) continue
      }
    } else if (inArchiveTab) {
      continue
    }

    const memList = Array.isArray(memBy[id]) ? memBy[id] : []
    const matchedHalls = clientListsMatchedHalls(client, memList, query.halls, lifecycleCtx)
    if (!matchedHalls.length) continue
    if (!clientMatchesListCriterion(client, memList, query, matchedHalls)) continue

    rows.push({
      client,
      clientId: id,
      halls: matchedHalls,
      archivedOn: clientArchivedOnIso(client.archived_at),
      birthDate: client.birth_date ?? null,
      markerHall: matchedHalls[0],
    })
  }

  rows.sort((a, b) => {
    const na = String(a.client?.name || '').localeCompare(String(b.client?.name || ''), 'ru')
    if (na) return na
    return String(a.clientId).localeCompare(String(b.clientId))
  })

  return { rows, count: rows.length, query }
}
