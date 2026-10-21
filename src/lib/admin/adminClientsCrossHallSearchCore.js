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
import {
  clientAdminVisibleHallSet,
  isAdminListEffectiveClubArchive,
} from './adminClientsListLifecycleCore.js'

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
 *   lifecycleCtx?: { lifecycleRows?: object[], asOf?: string },
 * }} p
 */
export function resolveAdminClientsSearchPool(p) {
  const list = Array.isArray(p?.clients) ? p.clients : []
  const tab = normalizeAdminClientsListTab(p?.clientsTab)
  if (shouldSearchAcrossHalls(p?.query, tab)) {
    const life = p?.lifecycleCtx
    const memBy = p?.memByClient && typeof p.memByClient === 'object' ? p.memByClient : {}
    return list.filter((c) => {
      if (c?.archived_at) return false
      if (!life) return true
      const id = c?.id != null ? String(c.id) : ''
      const memberships = id ? memBy[id] ?? memBy[c.id] ?? [] : []
      return !isAdminListEffectiveClubArchive({
        client: c,
        memberships,
        lifecycleRows: life.lifecycleRows ?? [],
        asOf: life.asOf,
      })
    })
  }
  const filterByTab = typeof p?.filterByTab === 'function' ? p.filterByTab : null
  if (!filterByTab) return list
  return filterByTab(list, tab, p?.memByClient)
}

/**
 * Режим строки поиска на списке клиентов.
 * `card` — фамилия (всё ФИО) и номер карты. Телефон не участвует:
 * короткий номер карты иначе попадает в середину чужих телефонов.
 * `phone` — фамилия и телефон. Карта не участвует.
 * @param {unknown} mode
 * @returns {'card' | 'phone'}
 */
export function normalizeAdminClientSearchMode(mode) {
  return String(mode ?? '').trim().toLowerCase() === 'phone' ? 'phone' : 'card'
}

function foldSearchText(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/ё/g, 'е')
}

function digitsOnly(raw) {
  return String(raw ?? '').replace(/\D/g, '')
}

/** Номер карты: без пробелов и «№», нижний регистр. Буква в начале («р247») сохраняется. */
function normalizeCardSearchToken(raw) {
  return foldSearchText(raw).replace(/^№\s*/i, '').replace(/\s+/g, '')
}

/**
 * Цифры телефона для сравнения: 8XXXXXXXXXX и 10 цифр → 7XXXXXXXXXX.
 * @param {unknown} raw
 */
function phoneDigitsForSearch(raw) {
  let d = digitsOnly(raw)
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length === 10) d = `7${d}`
  return d
}

/** В номере нет букв и «№» — это телефон, а не «р247» и не фамилия. */
function queryIsPhoneLike(query) {
  const s = foldSearchText(query)
  if (!s || /[a-zа-яё№]/i.test(s)) return false
  return digitsOnly(s).length >= 2
}

/**
 * @param {unknown} phone
 * @param {unknown} query
 */
export function clientPhoneMatchesAdminSearch(phone, query) {
  if (!queryIsPhoneLike(query)) return false
  const stored = phoneDigitsForSearch(phone)
  if (!stored) return false
  const raw = digitsOnly(query)
  const needles = new Set([raw, phoneDigitsForSearch(query)])
  // Набрали «8912…», в карточке номер уже с семёркой.
  if (raw.startsWith('8') && raw.length >= 2 && raw.length < 11) needles.add(`7${raw.slice(1)}`)
  for (const n of needles) {
    if (n && stored.includes(n)) return true
  }
  return false
}

/**
 * @param {unknown} card
 * @param {unknown} query
 */
export function clientCardMatchesAdminSearch(card, query) {
  const q = normalizeCardSearchToken(query)
  const c = normalizeCardSearchToken(card)
  if (!q || !c) return false
  return c.includes(q)
}

/**
 * Подсказка, если строка похожа не на тот режим (пустая выдача).
 * @param {unknown} query
 * @param {unknown} mode
 * @returns {string}
 */
export function adminClientSearchMissHint(query, mode) {
  const q = foldSearchText(query)
  if (q.length < 2) return ''
  const m = normalizeAdminClientSearchMode(mode)
  const phoneLike = queryIsPhoneLike(q)
  const cardLike = !phoneLike && normalizeCardSearchToken(q).length >= 2 && /\d/.test(q)
  if (m === 'card' && phoneLike && digitsOnly(q).length >= 10) {
    return 'Сейчас ищем фамилию и номер карты. Если это телефон — нажмите кнопку с трубкой.'
  }
  if (m === 'phone' && cardLike) {
    return 'Сейчас ищем фамилию и телефон. Если это номер карты — нажмите кнопку с картой.'
  }
  return ''
}

/**
 * Клиент совпадает со строкой поиска.
 * Буквы — всегда ФИО (фамилия, имя, отчество).
 * Цифры — только карта или только телефон, по режиму.
 * @param {object|null|undefined} client
 * @param {string} queryLower
 * @param {unknown} [mode] — `card` (по умолчанию) или `phone`
 */
export function clientMatchesAdminSearchQuery(client, queryLower, mode) {
  const q = foldSearchText(queryLower)
  if (!q) return true
  const nameHit = foldSearchText(client?.name).includes(q)
  if (normalizeAdminClientSearchMode(mode) === 'phone') {
    return nameHit || clientPhoneMatchesAdminSearch(client?.phone, q)
  }
  return nameHit || clientCardMatchesAdminSearch(client?.card_number, q)
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
