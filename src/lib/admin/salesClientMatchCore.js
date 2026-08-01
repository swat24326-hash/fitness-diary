/**
 * Match клиентов клуба по номеру карты, затем телефону (клип / вечер / закрытия).
 * Без React / IDB.
 */

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
 * @param {object[]} clients
 * @param {string} cardNumber
 * @returns {{ status: 'empty'|'none'|'one'|'conflict', client?: object, matches: object[], reason: string }}
 */
export function matchClientsByCardNumber(clients, cardNumber) {
  const n = normalizeSalesCardNumber(cardNumber)
  if (!n) {
    return {
      status: 'empty',
      matches: [],
      reason: 'Нет номера карты — укажите сегмент вручную или пропустите',
    }
  }
  const matches = (clients ?? []).filter(
    (c) => normalizeSalesCardNumber(c?.card_number) === n,
  )
  if (matches.length === 1) {
    return { status: 'one', client: matches[0], matches, reason: `Найден по карте №${n}` }
  }
  if (matches.length > 1) {
    return {
      status: 'conflict',
      matches,
      reason: `Два или больше клиентов с картой №${n} — разберите вручную`,
    }
  }
  return {
    status: 'none',
    matches: [],
    reason: `Клиент с картой №${n} не найден в Оси`,
  }
}

/**
 * @param {object[]} clients
 * @param {string} phone
 * @returns {{ status: 'empty'|'none'|'one'|'conflict', client?: object, matches: object[], reason: string }}
 */
export function matchClientsByPhone(clients, phone) {
  const n = normalizeSalesPhoneDigits(phone)
  if (!n || n.length < 10) {
    return {
      status: 'empty',
      matches: [],
      reason: 'Нет телефона для поиска — слабый match без карты',
    }
  }
  const matches = (clients ?? []).filter((c) => {
    const p = normalizeSalesPhoneDigits(c?.phone)
    return p && p === n
  })
  if (matches.length === 1) {
    return { status: 'one', client: matches[0], matches, reason: `Найден по телефону …${n.slice(-4)}` }
  }
  if (matches.length > 1) {
    return {
      status: 'conflict',
      matches,
      reason: `Два или больше клиентов с телефоном …${n.slice(-4)} — разберите вручную`,
    }
  }
  return {
    status: 'none',
    matches: [],
    reason: 'Клиент с таким телефоном не найден в Оси',
  }
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
 *   status: 'empty'|'none'|'one'|'conflict',
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
    const byCard = matchClientsByCardNumber(clients, card)
    if (byCard.status === 'one' || byCard.status === 'conflict') {
      return {
        ...byCard,
        matchedBy: 'card',
        weakMatch: false,
        fillCard: null,
      }
    }
  }

  if (phone) {
    const byPhone = matchClientsByPhone(clients, phone)
    if (byPhone.status === 'one') {
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
        : `Клиент с картой №${card} не найден в Оси`,
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
