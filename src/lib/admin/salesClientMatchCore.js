/**
 * Match клиентов клуба по номеру карты (импорт продаж / закрытий).
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
