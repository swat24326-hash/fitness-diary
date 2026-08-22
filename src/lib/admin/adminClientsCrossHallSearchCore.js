/**
 * Поиск клиентов админки по всем залам (не зависит от вкладки ПЗ/ТЗ/АЗ).
 */

import { CLIENT_HALL_TAB_LABELS, CLIENT_HALL_TAB_ORDER } from './clientHallTabsCore.js'
import { normalizeAdminClientsListTab } from './deskHallClientsCore.js'
import {
  hallMembershipListSignal,
  pickHallActiveMembership,
} from './deskMembershipLedgerCore.js'
import { clientMembershipHallSet } from '../membershipHallCore.js'
import { clientAdminVisibleHallSet } from './adminClientsListLifecycleCore.js'

/**
 * При непустом поиске по живому списку — ищем без фильтра вкладки зала.
 * @param {unknown} query
 * @param {unknown} clientsTab
 * @param {number} [minLen] — как у shouldShowAdminClientsList (по умолчанию 2)
 */
export function shouldSearchAcrossHalls(query, clientsTab, minLen = 2) {
  if (normalizeAdminClientsListTab(clientsTab) === 'archive') return false
  const min = Number(minLen) > 0 ? Number(minLen) : 2
  return String(query ?? '').trim().length >= min
}

/**
 * Базовый пул для списка: cross-hall = все неархивные; иначе вкладка.
 * @param {{
 *   clients: object[],
 *   clientsTab: string,
 *   query?: string,
 *   memByClient?: Record<string, object[]>,
 *   filterByTab: (clients: object[], tab: string, memByClient?: Record<string, object[]>) => object[],
 * }} p
 */
export function resolveAdminClientsSearchPool(p) {
  const list = Array.isArray(p?.clients) ? p.clients : []
  const tab = normalizeAdminClientsListTab(p?.clientsTab)
  if (shouldSearchAcrossHalls(p?.query, tab)) {
    return list.filter((c) => !c?.archived_at)
  }
  const filterByTab = typeof p?.filterByTab === 'function' ? p.filterByTab : null
  if (!filterByTab) return list
  return filterByTab(list, tab, p?.memByClient)
}

/**
 * Клиент совпадает со строкой поиска (ФИО / телефон / карта).
 * @param {object|null|undefined} client
 * @param {string} queryLower — уже trim + toLowerCase
 */
export function clientMatchesAdminSearchQuery(client, queryLower) {
  const q = String(queryLower ?? '').trim().toLowerCase()
  if (!q) return true
  const name = String(client?.name ?? '').toLowerCase()
  const phone = String(client?.phone ?? '').toLowerCase()
  const card = String(client?.card_number ?? '').toLowerCase()
  return name.includes(q) || phone.includes(q) || card.includes(q)
}

/**
 * Стек залов для выдачи поиска: только залы, где клиент реально есть.
 * @param {object|null|undefined} client
 * @param {object[]|null|undefined} memberships
 * @param {{ today?: string, trainerName?: string, lifecycleRows?: object[] }} [opts]
 * @returns {Array<{ hall: string, label: string, summary: string, hrefHall: string, signalKey: string, signalColor: string }>}
 */
export function buildClientHallStack(client, memberships, opts = {}) {
  const today = String(opts.today ?? '').slice(0, 10)
  const trainerName = String(opts.trainerName ?? '').trim()
  const clientId = String(client?.id ?? '').trim()
  const lifecycleRows =
    opts.lifecycleRows != null
      ? (opts.lifecycleRows ?? []).filter((r) => String(r?.client_id ?? '') === clientId)
      : null
  const halls =
    lifecycleRows != null
      ? clientAdminVisibleHallSet({
          client,
          memberships,
          lifecycleRows,
          asOf: today || undefined,
        })
      : clientMembershipHallSet(client, memberships)
  /** @type {ReturnType<typeof buildClientHallStack>} */
  const stack = []
  for (const hall of CLIENT_HALL_TAB_ORDER) {
    if (!halls.has(hall)) continue
    const sig = hallMembershipListSignal(memberships, today || undefined, hall, client)
    const active = pickHallActiveMembership(memberships, today || undefined, hall)
    void active
    let summary = String(sig?.factLabel || sig?.label || '').trim() || '—'
    if (hall === 'pz' && trainerName) {
      summary = `${trainerName} · ${summary}`
    }
    stack.push({
      hall,
      label: CLIENT_HALL_TAB_LABELS[hall] || hall.toUpperCase(),
      summary,
      hrefHall: hall,
      signalKey: String(sig?.key ?? ''),
      signalColor: String(sig?.color ?? ''),
    })
  }
  return stack
}

/**
 * Зал для фактов «Абонемент» / ссылки карточки в cross-hall поиске:
 * первый в стеке (порядок ПЗ→ТЗ→АЗ), иначе fallback.
 * @param {Array<{ hall?: string, hrefHall?: string }>} hallStack
 * @param {string|null|undefined} fallbackHall
 */
export function resolveCrossHallSearchFactHall(hallStack, fallbackHall = null) {
  const first = Array.isArray(hallStack) ? hallStack[0] : null
  const fromStack = String(first?.hrefHall || first?.hall || '')
    .trim()
    .toLowerCase()
  if (fromStack === 'pz' || fromStack === 'tz' || fromStack === 'az') return fromStack
  const fb = String(fallbackHall ?? '').trim().toLowerCase()
  if (fb === 'pz' || fb === 'tz' || fb === 'az') return fb
  return ''
}

/** @deprecated alias — то же, что resolveCrossHallSearchFactHall */
export const resolveCrossHallCardHall = resolveCrossHallSearchFactHall
