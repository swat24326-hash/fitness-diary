import { useInstallPrompt } from '../../hooks/useInstallPrompt.js'
import { clientInstallMode } from '../../lib/client/clientInstallCore.js'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || window.navigator.standalone === true
}

/**
 * Установка на телефон. Окно браузера ловится при старте приложения (installPromptStore) —
 * хук живёт в ClientAppContext, чтобы кнопка работала с любого экрана /me.
 * @returns {{ mode: 'none'|'prompt'|'ios'|'android', install: () => Promise<boolean>, installed: boolean }}
 */
export function useClientInstall() {
  const { hasPrompt, installedNow, install } = useInstallPrompt()
  const installed = installedNow || isStandalone()
  const mode = clientInstallMode({
    standalone: installed,
    hasPrompt,
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  })
  return { mode, install, installed }
}
