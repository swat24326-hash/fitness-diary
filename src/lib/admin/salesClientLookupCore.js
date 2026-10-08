/**
 * Шаблоны ILIKE для поиска клиента клуба по карте / телефону в БД.
 * Шаблон — надмножество: точное сравнение потом делает matchClientByCardThenPhone.
 */

import { normalizeSalesCardNumber, normalizeSalesPhoneDigits } from './salesClientMatchCore.js'

function escapeLikeChar(ch) {
  return ch === '%' || ch === '_' || ch === '\\' ? `\\${ch}` : ch
}

/**
 * Буквы → `_`: регистр кириллицы в ILIKE зависит от локали БД, «Р247» должен найтись по «р247».
 * @param {unknown} raw
 * @returns {string|null}
 */
export function buildSalesCardIlikePattern(raw) {
  const card = normalizeSalesCardNumber(raw)
  if (!card) return null
  const body = [...card].map((ch) => (/\p{L}/u.test(ch) ? '_' : escapeLikeChar(ch))).join('')
  return `%${body}%`
}

/**
 * Выражение для `.or()`: любая из карт (значения в кавычках — запятая в номере не режет список).
 * @param {unknown[]} cards
 * @returns {string|null}
 */
export function buildSalesCardsOrIlikeExpr(cards) {
  const atoms = [
    ...new Set((cards ?? []).map(buildSalesCardIlikePattern).filter(Boolean)),
  ].map((pattern) => `card_number.ilike."${pattern.replace(/"/g, '\\"')}"`)
  return atoms.length ? atoms.join(',') : null
}

/**
 * Последние 10 цифр через `%`: в базе «+7 (912) 345-67-89», «8912…», «912…».
 * @param {unknown} raw
 * @returns {string|null}
 */
export function buildSalesPhoneIlikePattern(raw) {
  const digits = normalizeSalesPhoneDigits(raw)
  if (digits.length < 10) return null
  const national = digits.length === 11 && digits.startsWith('7') ? digits.slice(1) : digits
  return `%${[...national].join('%')}%`
}

/**
 * @param {object[][]} lists
 * @returns {object[]}
 */
export function mergeClientRowsById(lists) {
  const byId = new Map()
  for (const list of lists) {
    for (const row of list ?? []) {
      const id = String(row?.id ?? '').trim()
      if (id && !byId.has(id)) byId.set(id, row)
    }
  }
  return [...byId.values()]
}
