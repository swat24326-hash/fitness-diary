/**
 * Слияние даты рождения из client в форму карточки.
 * Пока пользователь правит (dirty) — не затирать очистку старым значением из hydrate.
 */

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
  const fromClient = String(p?.fromClientBirth ?? '').trim()
  const prev = String(p?.prevBirth ?? '').trim()
  if (p?.switched) return fromClient
  if (p?.birthDirty) return prev
  return fromClient
}
