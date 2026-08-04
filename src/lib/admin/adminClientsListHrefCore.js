/**
 * Ссылки списка/карточки клиентов админа и менеджера продаж.
 * Состояние списка в query: club, clientsTab, filter, page, q, trainer.
 */

import { normalizeAdminClientQuickFilter } from './adminClientsFunnelCore.js'
import { normalizeAdminClientsListTab } from './deskHallClientsCore.js'

/** Ключи списка — переносятся на карточку и обратно. */
export const ADMIN_CLIENTS_LIST_QS_KEYS = Object.freeze([
  'club',
  'clientsTab',
  'list',
  'filter',
  'page',
  'q',
  'trainer',
])

/**
 * @param {URLSearchParams | Record<string, string> | string | null | undefined} source
 * @returns {URLSearchParams}
 */
export function pickAdminClientsListSearchParams(source) {
  const out = new URLSearchParams()
  let src
  if (source instanceof URLSearchParams) src = source
  else if (typeof source === 'string') src = new URLSearchParams(source.startsWith('?') ? source.slice(1) : source)
  else if (source && typeof source === 'object') src = new URLSearchParams(source)
  else src = new URLSearchParams()

  for (const key of ADMIN_CLIENTS_LIST_QS_KEYS) {
    const v = String(src.get?.(key) ?? src[key] ?? '').trim()
    if (v) out.set(key, v)
  }
  return out
}

/**
 * @param {{
 *   clubId?: string,
 *   clientsTab?: string,
 *   filter?: string,
 *   page?: number,
 *   query?: string,
 *   trainerQuery?: string,
 * }} [opts]
 */
export function buildAdminClientsListSearch(opts = {}) {
  const qs = new URLSearchParams()
  const clubId = String(opts.clubId ?? '').trim()
  if (clubId) qs.set('club', clubId)

  const tab = normalizeAdminClientsListTab(opts.clientsTab)
  if (tab && tab !== 'active') qs.set('clientsTab', tab)

  const filter = normalizeAdminClientQuickFilter(opts.filter)
  if (filter && filter !== 'none') qs.set('filter', filter)

  const page = Number(opts.page)
  if (Number.isFinite(page) && page >= 2) qs.set('page', String(Math.floor(page)))

  const q = String(opts.query ?? '').trim()
  if (q) qs.set('q', q)

  const trainer = String(opts.trainerQuery ?? '').trim()
  if (trainer) qs.set('trainer', trainer)

  return qs
}

/**
 * @param {string} basePath `/admin/clients` | `/sales/clients`
 * @param {Parameters<typeof buildAdminClientsListSearch>[0]} [opts]
 */
export function buildAdminClientsListHref(basePath, opts = {}) {
  const path = String(basePath || '/admin/clients').replace(/\/$/, '') || '/admin/clients'
  const qs = buildAdminClientsListSearch(opts)
  const tail = qs.toString()
  return tail ? `${path}?${tail}` : path
}

/**
 * Карточка с тем же query списка — «назад» вернёт во вкладку/фильтр/страницу.
 * @param {string} basePath
 * @param {string} clientId
 * @param {Parameters<typeof buildAdminClientsListSearch>[0] | URLSearchParams | string} [listState]
 */
export function buildAdminClientCardHref(basePath, clientId, listState = {}) {
  const id = String(clientId ?? '').trim()
  const path = String(basePath || '/admin/clients').replace(/\/$/, '') || '/admin/clients'
  if (!id) return buildAdminClientsListHref(path, typeof listState === 'object' && !(listState instanceof URLSearchParams) ? listState : {})

  let qs
  if (listState instanceof URLSearchParams || typeof listState === 'string') {
    qs = pickAdminClientsListSearchParams(listState)
  } else {
    qs = buildAdminClientsListSearch(listState || {})
  }
  const tail = qs.toString()
  return tail ? `${path}/${id}?${tail}` : `${path}/${id}`
}

/**
 * Ссылка «к списку» с карточки — сохраняем query списка.
 * @param {string} basePath
 * @param {URLSearchParams | string} searchParams
 */
export function buildAdminClientsBackHref(basePath, searchParams) {
  const path = String(basePath || '/admin/clients').replace(/\/$/, '') || '/admin/clients'
  const qs = pickAdminClientsListSearchParams(searchParams)
  const tail = qs.toString()
  return tail ? `${path}?${tail}` : path
}

/** @param {string | null | undefined} raw */
export function parseAdminClientsListPage(raw) {
  const n = parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n) || n < 1) return 0
  return n - 1
}
