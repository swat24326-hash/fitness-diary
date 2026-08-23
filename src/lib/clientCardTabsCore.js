/**
 * Вкладки карточки клиента — URL (?tab=, ?mode=) и deep link.
 */

import { normalizeClientStatsMode } from './clientStatsModeCore.js'

export const CLIENT_CARD_TAB_IDS = Object.freeze([
  'health',
  'nutrition',
  'homework',
  'memberships',
  'diaries',
  'loyalty',
  'stats',
])

/**
 * @param {unknown} raw
 * @returns {'health' | 'nutrition' | 'homework' | 'memberships' | 'diaries' | 'loyalty' | 'stats' | null}
 */
export function normalizeClientCardTab(raw) {
  const t = String(raw ?? '').trim().toLowerCase()
  return CLIENT_CARD_TAB_IDS.includes(t) ? /** @type {const} */ (t) : null
}

/**
 * @param {URLSearchParams} qs
 * @param {string} tab
 * @param {{ statsMode?: string | null, clearStatsMode?: boolean }} [opts]
 */
export function writeClientCardTabToSearchParams(qs, tab, opts = {}) {
  const t = normalizeClientCardTab(tab) ?? 'health'
  if (t === 'health') qs.delete('tab')
  else qs.set('tab', t)

  const clearMode = opts.clearStatsMode === true || t !== 'stats'
  if (clearMode) {
    qs.delete('mode')
    return qs
  }

  const mode = normalizeClientStatsMode(opts.statsMode)
  if (mode && mode !== 'measurements') qs.set('mode', mode)
  else qs.delete('mode')
  return qs
}

/**
 * @param {string} tab
 * @param {string | null | undefined} [statsMode]
 * @returns {string} query без «?»
 */
export function buildClientCardTabQuery(tab, statsMode = null) {
  const qs = new URLSearchParams()
  writeClientCardTabToSearchParams(qs, tab, { statsMode, clearStatsMode: false })
  return qs.toString()
}

/**
 * Ссылка на статистику посещаемости клиента.
 * @param {string} clientId
 * @param {{ clubId?: string, forAdmin?: boolean, forSales?: boolean, forSupervisor?: boolean, from?: string }} [opts]
 */
export function buildClientAttendanceStatsPath(clientId, opts = {}) {
  const id = String(clientId ?? '').trim()
  if (!id) return '/trainer/clients'
  let path
  if (opts.forSupervisor) path = `/club/clients/${id}`
  else if (opts.forSales) path = `/sales/clients/${id}`
  else if (opts.forAdmin) path = `/admin/clients/${id}`
  else path = `/trainer/clients/${id}`

  const qs = new URLSearchParams()
  const clubId = String(opts.clubId ?? '').trim()
  if (clubId && !opts.forSupervisor && !opts.forSales) qs.set('club', clubId)
  const from = String(opts.from ?? '').trim()
  if (from) qs.set('from', from)
  writeClientCardTabToSearchParams(qs, 'stats', { statsMode: 'attendance', clearStatsMode: false })
  const tail = qs.toString()
  return tail ? `${path}?${tail}` : `${path}?tab=stats&mode=attendance`
}
