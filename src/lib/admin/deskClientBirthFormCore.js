/**
 * Слияние даты рождения из client в форму карточки.
 * Пока пользователь правит (dirty) — не затирать очистку старым значением из hydrate.
 */

import { mergeDeskClientFormField } from './deskClientFormMergeCore.js'

/**
 * @param {{
 *   fromClientBirth?: string,
 *   prevBirth?: string,
 *   switched?: boolean,
 *   birthDirty?: boolean,
 * }} p
 * @returns {string} YYYY-MM-DD или ''
 */
export function mergeDeskClientBirthForm(p) {
  return mergeDeskClientFormField({
    fromClient: p?.fromClientBirth,
    prev: p?.prevBirth,
    switched: p?.switched,
    dirty: p?.birthDirty,
  })
}
