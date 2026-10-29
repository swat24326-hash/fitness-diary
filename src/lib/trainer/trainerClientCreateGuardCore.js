/**
 * Защита от дублей при создании клиента тренером (повторный тап «Создать»).
 */

import { formatClientName } from '../clientNameFormat.js'

/** Второй тап, пока первый create ещё идёт. */
export function shouldSkipDuplicateClientCreateClick(inFlight) {
  return inFlight === true
}

/**
 * Карточки с тем же нормализованным ФИО (риск дубля без № карты / телефона).
 * @param {object[]} pool
 * @param {string} name
 * @returns {object[]}
 */
export function findClientsWithSameFormattedName(pool, name) {
  const target = formatClientName(name)
  if (!target) return []
  const list = Array.isArray(pool) ? pool : []
  return list.filter((c) => formatClientName(c?.name) === target)
}

/**
 * Текст confirm перед второй карточкой с тем же ФИО.
 * @param {string} name
 * @param {number} count
 */
export function sameNameCreateConfirmMessageRu(name, count) {
  const label = formatClientName(name) || 'этот клиент'
  const n = Math.max(1, Number(count) || 1)
  if (n === 1) {
    return `Уже есть карточка «${label}». Создать ещё одну? Если это тот же человек — отмените и откройте существующую.`
  }
  return `Уже есть ${n} карточки с ФИО «${label}». Создать ещё одну? Если это тот же человек — отмените и откройте существующую.`
}
