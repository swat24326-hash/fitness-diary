/**
 * Слияние поля формы карточки клиента с hydrate из client.
 * Пока пользователь правит (dirty) — не затирать черновик старым значением.
 */

/**
 * @param {{
 *   fromClient?: string | null,
 *   prev?: string | null,
 *   switched?: boolean,
 *   dirty?: boolean,
 * }} p
 * @returns {string}
 */
export function mergeDeskClientFormField(p) {
  const fromClient = String(p?.fromClient ?? '').trim()
  const prev = String(p?.prev ?? '')
  if (p?.switched) return fromClient
  if (p?.dirty) return prev
  return fromClient
}

/**
 * После Save: снять dirty, когда hydrate догнал сохранённое значение.
 * @param {{ saved?: string, fromClient?: string | null }} p
 * @returns {boolean} true = dirty можно снять
 */
export function ackSavedDeskField(p) {
  if (p?.saved === undefined) return false
  return String(p?.fromClient ?? '').trim() === String(p.saved)
}
