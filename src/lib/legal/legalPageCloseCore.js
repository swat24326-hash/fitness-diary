/**
 * Как закрыть публичную legal-страницу: назад по истории, закрыть вкладку (оферта из gate), иначе вход.
 * @param {{ historyLength: number, hasOpener: boolean }} p
 * @returns {'back' | 'close' | 'login'}
 */
export function legalPageCloseAction({ historyLength, hasOpener }) {
  const len = Number(historyLength) || 0
  if (len > 1) return 'back'
  if (hasOpener) return 'close'
  return 'login'
}
