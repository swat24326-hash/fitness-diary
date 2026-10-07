import { useCallback, useEffect, useState } from 'react'
import { clientInstallMode } from '../../lib/client/clientInstallCore.js'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || window.navigator.standalone === true
}

/**
 * Установка на телефон. Событие beforeinstallprompt браузер шлёт один раз за загрузку —
 * хук живёт в ClientAppContext, чтобы кнопка работала с любого экрана /me.
 * @returns {{ mode: 'none'|'prompt'|'ios', install: () => Promise<boolean>, installed: boolean }}
 */
export function useClientInstall() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setPromptEvent(e)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!promptEvent) return false
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    if (outcome !== 'accepted') return false
    setInstalled(true)
    return true
  }, [promptEvent])

  const mode = clientInstallMode({
    standalone: installed,
    hasPrompt: !!promptEvent,
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
  })
  return { mode, install, installed }
}
