import { useCallback, useEffect, useState } from 'react'
import { CLIENT_INSTALL_HIDDEN_KEY, clientInstallMode } from '../../lib/client/clientInstallCore.js'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true || window.navigator.standalone === true
}

function readHidden() {
  try {
    return localStorage.getItem(CLIENT_INSTALL_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

/** @returns {{ mode: 'none'|'prompt'|'ios', install: () => Promise<void>, hide: () => void, installed: boolean }} */
export function useClientInstall() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [hidden, setHidden] = useState(readHidden)
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
    if (!promptEvent) return
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
  }, [promptEvent])

  const hide = useCallback(() => {
    try {
      localStorage.setItem(CLIENT_INSTALL_HIDDEN_KEY, '1')
    } catch {
      /* приватный режим — просто прячем до перезагрузки */
    }
    setHidden(true)
  }, [])

  const mode = clientInstallMode({
    standalone: installed,
    hasPrompt: !!promptEvent,
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    hidden,
  })
  return { mode, install, hide, installed }
}
