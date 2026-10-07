/** Установка приложения клиента на телефон (без React): какой вариант подсказки показать. */

export function isIosUserAgent(ua, maxTouchPoints = 0) {
  const s = String(ua ?? '')
  if (/iPhone|iPad|iPod/i.test(s)) return true
  return /Macintosh/i.test(s) && Number(maxTouchPoints) > 1
}

/**
 * @param {{ standalone: boolean, hasPrompt: boolean, ua: string, maxTouchPoints?: number }} env
 * @returns {'none' | 'prompt' | 'ios'} prompt — системное окно (Android / Chrome), ios — инструкция «На экран Домой».
 */
export function clientInstallMode({ standalone, hasPrompt, ua, maxTouchPoints = 0 }) {
  if (standalone) return 'none'
  if (hasPrompt) return 'prompt'
  if (isIosUserAgent(ua, maxTouchPoints)) return 'ios'
  return 'none'
}
