/** Карточка «Напоминания о тренировках» в /me (без React): какой вариант показать. */

/**
 * iPhone присылает push только приложению со значка «Домой» (iOS 16.4+) — до установки подсказка, не кнопка.
 * @param {{ configured: boolean, supported: boolean, ios: boolean, standalone: boolean, permission: string, subscribed: boolean }} env
 * @returns {'none' | 'install_first' | 'off' | 'on' | 'denied'}
 */
export function clientPushMode({ configured, supported, ios, standalone, permission, subscribed }) {
  if (!configured) return 'none'
  if (ios && !standalone) return 'install_first'
  if (!supported) return 'none'
  if (permission === 'denied') return 'denied'
  if (subscribed && permission === 'granted') return 'on'
  return 'off'
}
