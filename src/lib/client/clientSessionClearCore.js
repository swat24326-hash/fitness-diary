/**
 * Когда стирать локальные данные клиента (/me кэш, переписка на телефоне).
 * Сессия умерла сама — кэш не трогаем (только токены).
 * «Выйти» и вход другого человека по ссылке — стираем.
 */

/**
 * Вход по ссылке: стереть кэш, если на телефоне был другой клиент или человека ещё не помним.
 * Тот же client_id — кэш оставляем (после самопроизвольного вылета сессии).
 * @param {string|number|null|undefined} prevClientId
 * @param {string|number|null|undefined} nextClientId
 */
function clientIdKey(id) {
  if (id == null) return ''
  const s = String(id).trim()
  return s || ''
}

export function shouldWipeClientLocalOnRedeem(prevClientId, nextClientId) {
  const prev = clientIdKey(prevClientId)
  const next = clientIdKey(nextClientId)
  if (!next) return true
  if (!prev) return true
  return prev !== next
}
