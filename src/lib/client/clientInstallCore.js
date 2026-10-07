/** Установка приложения клиента на телефон (без React): какой вариант подсказки показать. */

export const CLIENT_INSTALL_HIDDEN_KEY = 'fd_client_install_hidden'

export function isIosUserAgent(ua, maxTouchPoints = 0) {
  const s = String(ua ?? '')
  if (/iPhone|iPad|iPod/i.test(s)) return true
  return /Macintosh/i.test(s) && Number(maxTouchPoints) > 1
}

/**
 * @param {{ standalone: boolean, hasPrompt: boolean, ua: string, maxTouchPoints?: number, hidden?: boolean }} env
 * @returns {'none' | 'prompt' | 'ios'} prompt — системное окно (Android / Chrome), ios — инструкция «На экран Домой».
 */
export function clientInstallMode({ standalone, hasPrompt, ua, maxTouchPoints = 0, hidden = false }) {
  if (standalone || hidden) return 'none'
  if (hasPrompt) return 'prompt'
  if (isIosUserAgent(ua, maxTouchPoints)) return 'ios'
  return 'none'
}
