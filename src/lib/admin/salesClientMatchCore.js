/**
 * Match клиентов клуба по номеру карты, затем телефону (клип / вечер / закрытия).
 * Без React / IDB.
 */

import { isClientArchived } from '../clientArchive.js'

/**
 * Сузить кандидатов: без архива; для desk-импорта — один desk или один живой (не conflict).
 * @param {object[]} matches
 * @param {{ preferOperational?: boolean, deskImportResolve?: boolean }} [opts]
 * @returns {object[]}
 */
export function narrowClientMatchCandidates(matches, opts = {}) {
  let list = Array.isArray(matches) ? [...matches] : []
  if (!list.length) return list

  if (opts.preferOperational || opts.deskImportResolve) {
    const ops = list.filter((c) => !isClientArchived(c))
    if (ops.length > 0) list = ops
    // desk: только архивные — оставляем (вернуть + абон), не create-дубль
  }

  if (opts.deskImportResolve && list.length > 1) {
    const desk = list.filter((c) => {
      const h = String(c?.desk_hall ?? '')
        .trim()
        .toLowerCase()
      return h === 'tz' || h === 'az' || h === 'тз' || h === 'аз'
    })
    const pool = desk.length > 0 ? desk : list
    pool.sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))
    return [pool[0]]
  }

  return list
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeSalesCardNumber(raw) {
  let s = String(raw ?? '')
    .trim()
    .replace(/^№\s*/i, '')
    .replace(/\s+/g, '')
  if (!s) return ''
  // частый вид «р247» / «R247»
  return s.toLowerCase()
}

/**
 * Нормализация телефона для match (только цифры; 8XXXXXXXXXX → 7…).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeSalesPhoneDigits(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  if (d.length === 10) d = `7${d}`
  return d
}

/**
 * Похоже ли значение на номер карты (не ФИО).
 * @param {unknown} raw
 */
export function looksLikeSalesCardNumber(raw) {
  const s = normalizeSalesCardNumber(raw)
  if (!s) return false
  if (/^\d{3,6}$/.test(s)) return true
  if (/^[a-zа-яё]\d{2,5}$/i.test(s)) return true
  if (/^\d{4,8}$/.test(s)) return true
  return false
}

/**
 * Токены ФИО для сопоставления с оплатой (фамилия + имя).
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeSalesPersonNameTokens(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Совпадает ли ФИО карточки с ФИО из файла оплаты (фамилия обязательна).
 * @param {unknown} clientName
 * @param {unknown} paymentName
 */
export function clientNameMatchesPaymentName(clientName, paymentName) {
  const a = normalizeSalesPersonNameTokens(clientName)
  const b = normalizeSalesPersonNameTokens(paymentName)
  if (!a.length || !b.length) return false
  if (a[0] !== b[0]) return false
  if (a.length >= 2 && b.length >= 2) {
    if (a[1] === b[1]) return true
    const ai = a[1][0]
    const bi = b[1][0]
    return Boolean(ai && bi && ai === bi)
  }
  return true
}

/**
 * Сузить список кандидатов по ФИО из оплаты (конфликт карты → один человек).
 * @param {object[]} matches
 * @param {unknown} paymentName
 * @returns {object[]}
 */
export function narrowClientMatchesByPaymentName(matches, paymentName) {
  const list = Array.isArray(matches) ? matches : []
  if (list.length <= 1) return list
  const named = list.filter((c) => clientNameMatchesPaymentName(c?.name, paymentName))
  if (named.length >= 1) return named
  return list
}

/**
 * @param {object[]} matches
 * @param {{ oneReason: string, archivedReason: string, conflictReason: string, noneReason: string }} labels
 * @returns {{ status: 'none'|'one'|'archived'|'conflict', client?: object, matches: object[], reason: string }}
 */
function finalizeClientMatchResult(matches, labels) {
  const list = Array.isArray(matches) ? matches : []
  if (list.length === 1) {
    const client = list[0]
    if (isClientArchived(client)) {
      return {
        status: 'archived',
        client,
        matches: list,
        reason: labels.archivedReason,
      }
    }
    return { status: 'one', client, matches: list, reason: labels.oneReason }
  }
  if (list.length > 1) {
    return {
      status: 'conflict',
      matches: list,
      reason: labels.conflictReason,
    }
  }
  return {
    status: 'none',
    matches: [],
    reason: labels.noneReason,
  }
}

/**
 * @param {object[]} clients
 * @param {string} cardNumber
 * @param {{ preferOperational?: boolean, deskImportResolve?: boolean, paymentName?: string|null }} [opts]
 * @returns {{ status: 'empty'|'none'|'one'|'archived'|'conflict', client?: object, matches: object[], reason: string }}
 */
export function matchClientsByCardNumber(clients, cardNumber, opts = {}) {
  const n = normalizeSalesCardNumber(cardNumber)
  if (!n) {
    return {
      status: 'empty',
      matches: [],
      reason: 'Нет номера карты — укажите сегмент вручную или пропустите',
    }
  }
  const raw = (clients ?? []).filter((c) => normalizeSalesCardNumber(c?.card_number) === n)
  let matches = narrowClientMatchCandidates(raw, opts)
  if (opts.paymentName != null && String(opts.paymentName).trim()) {
    matches = narrowClientMatchesByPaymentName(matches, opts.paymentName)
  }
  return finalizeClientMatchResult(matches, {
    oneReason: `Найден по карте №${n}`,
    archivedReason: `Клиент с картой №${n} в архиве — можно вернуть`,
    conflictReason: `Два или больше клиентов с картой №${n} — разберите вручную`,
    noneReason: `Клиент с картой №${n} не найден в базе данных`,
  })
}

/**
 * @param {object[]} clients
 * @param {string} phone
 * @param {{ preferOperational?: boolean, deskImportResolve?: boolean }} [opts]
 * @returns {{ status: 'empty'|'none'|'one'|'archived'|'conflict', client?: object, matches: object[], reason: string }}
 */
export function matchClientsByPhone(clients, phone, opts = {}) {
  const n = normalizeSalesPhoneDigits(phone)
  if (!n || n.length < 10) {
    return {
      status: 'empty',
      matches: [],
      reason: 'Нет телефона для поиска — слабый match без карты',
    }
  }
  const raw = (clients ?? []).filter((c) => {
    const p = normalizeSalesPhoneDigits(c?.phone)
    return p && p === n
  })
  const matches = narrowClientMatchCandidates(raw, opts)
  return finalizeClientMatchResult(matches, {
    oneReason: `Найден по телефону …${n.slice(-4)}`,
    archivedReason: `Клиент с телефоном …${n.slice(-4)} в архиве — можно вернуть`,
    conflictReason: `Два или больше клиентов с телефоном …${n.slice(-4)} — разберите вручную`,
    noneReason: 'Клиент с таким телефоном не найден в базе данных',
  })
}

/**
 * Каскад: карта → телефон. При успехе по телефону и пустой карте у клиента — флаг fillCard.
 * @param {{
 *   clients: object[],
 *   cardNumber?: string|null,
 *   phone?: string|null,
 *   preferOperational?: boolean,
 * }} input
 * @returns {{
 *   status: 'empty'|'none'|'one'|'archived'|'conflict',
 *   client?: object,
 *   matches: object[],
 *   reason: string,
 *   matchedBy: 'card'|'phone'|null,
 *   weakMatch: boolean,
 *   fillCard?: string|null,
 * }}
 */
export function matchClientByCardThenPhone(input) {
  const clients = input?.clients ?? []
  const card = normalizeSalesCardNumber(input?.cardNumber)
  const phone = normalizeSalesPhoneDigits(input?.phone)
  const matchOpts = {
    preferOperational: Boolean(input?.preferOperational),
    deskImportResolve: Boolean(input?.deskImportResolve),
  }

  if (!card && !phone) {
    return {
      status: 'empty',
      matches: [],
      reason: 'Нет номера карты и телефона — укажите хотя бы одно',
      matchedBy: null,
      weakMatch: true,
    }
  }

  if (card) {
    const byCard = matchClientsByCardNumber(clients, card, matchOpts)
    if (byCard.status === 'one' || byCard.status === 'archived' || byCard.status === 'conflict') {
      return {
        ...byCard,
        matchedBy: 'card',
        weakMatch: false,
        fillCard: null,
      }
    }
  }

  if (phone) {
    const byPhone = matchClientsByPhone(clients, phone, matchOpts)
    if (byPhone.status === 'one' || byPhone.status === 'archived') {
      const c = byPhone.client
      const existingCard = normalizeSalesCardNumber(c?.card_number)
      const fillCard = card && !existingCard ? card : null
      return {
        ...byPhone,
        matchedBy: 'phone',
        weakMatch: !card,
        fillCard,
        reason: fillCard
          ? `${byPhone.reason}; на клипе карта №${card} — можно дописать на карточку`
          : card
            ? `${byPhone.reason} (карта №${card} в клубе не найдена)`
            : `${byPhone.reason} — без карты поиск слабее`,
      }
    }
    if (byPhone.status === 'conflict') {
      return {
        ...byPhone,
        matchedBy: 'phone',
        weakMatch: !card,
        fillCard: null,
      }
    }
    if (byPhone.status === 'none' && !card) {
      return {
        ...byPhone,
        matchedBy: null,
        weakMatch: true,
      }
    }
  }

  if (card) {
    return {
      status: 'none',
      matches: [],
      reason: phone
        ? `Клиент с картой №${card} не найден; по телефону тоже нет`
        : `Клиент с картой №${card} не найден в базе данных`,
      matchedBy: null,
      weakMatch: false,
    }
  }

  return {
    status: 'none',
    matches: [],
    reason: 'Клиент не найден по телефону',
    matchedBy: null,
    weakMatch: true,
  }
}

/**
 * Клиент с этой картой в указанном клубе (сеть: тот же номер в другом клубе — не конфликт).
 * Предпочитает неархивных; если только архив — возвращает его (карта всё равно занята в клубе).
 * @param {object[]|null|undefined} clients
 * @param {string|null|undefined} clubId
 * @param {unknown} cardNumber
 * @returns {object|null}
 */
export function findClubClientByCard(clients, clubId, cardNumber) {
  const cid = String(clubId ?? '').trim()
  const n = normalizeSalesCardNumber(cardNumber)
  if (!cid || !n) return null
  const inClub = (clients ?? []).filter(
    (c) =>
      String(c?.club_id ?? '').trim() === cid && normalizeSalesCardNumber(c?.card_number) === n,
  )
  if (!inClub.length) return null
  const ops = inClub.filter((c) => !isClientArchived(c))
  const pool = ops.length > 0 ? ops : inClub
  pool.sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))
  return pool[0] ?? null
}

/**
 * Текст предупреждения при попытке создать карточку с занятой в клубе картой.
 * @param {object|null|undefined} client
 * @param {unknown} [cardNumber]
 * @returns {string}
 */
export function cardConflictCreateError(client, cardNumber) {
  const n =
    normalizeSalesCardNumber(cardNumber) || normalizeSalesCardNumber(client?.card_number) || '—'
  const name = String(client?.name ?? '').trim() || 'без имени'
  const archived = isClientArchived(client) ? ' (в архиве)' : ''
  return `В этом клубе клиент с картой №${n} уже есть: ${name}${archived}. Новую карточку не создаём.`
}

/**
 * Можно ли назначить карту клиенту в клубе (создание или смена номера).
 * Пустая карта — всегда ok (как partial UNIQUE в SQL).
 * @param {object[]|null|undefined} clients
 * @param {string|null|undefined} clubId
 * @param {unknown} cardNumber
 * @param {{ excludeClientId?: string|null }} [opts] при правке — не считать себя конфликтом
 * @returns {{ ok: true } | { ok: false, error: string, client: object }}
 */
export function assertClubCardAvailableForCreate(clients, clubId, cardNumber, opts = {}) {
  const n = normalizeSalesCardNumber(cardNumber)
  if (!n) return { ok: true }
  const cid = String(clubId ?? '').trim()
  if (!cid) return { ok: true }
  const excludeId = String(opts.excludeClientId ?? '').trim()
  const matches = (clients ?? []).filter(
    (c) =>
      String(c?.club_id ?? '').trim() === cid &&
      normalizeSalesCardNumber(c?.card_number) === n &&
      (!excludeId || String(c?.id ?? '') !== excludeId),
  )
  if (!matches.length) return { ok: true }
  const ops = matches.filter((c) => !isClientArchived(c))
  const pool = ops.length > 0 ? ops : matches
  pool.sort((a, b) => String(a?.id ?? '').localeCompare(String(b?.id ?? '')))
  const hit = pool[0]
  const base = cardConflictCreateError(hit, n)
  const error = excludeId
    ? base.replace(
        'Новую карточку не создаём.',
        'Выберите другой номер или откройте существующую карточку.',
      )
    : base
  return { ok: false, error, client: hit }
}
