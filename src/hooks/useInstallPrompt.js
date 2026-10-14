import { useSyncExternalStore } from 'react'
import { hasInstallPrompt, promptInstall, subscribeInstallPrompt, wasAppInstalled } from '../lib/pwa/installPromptStore.js'

/** @returns {{ hasPrompt: boolean, installedNow: boolean, install: () => Promise<boolean> }} */
export function useInstallPrompt() {
  const hasPrompt = useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt)
  const installedNow = useSyncExternalStore(subscribeInstallPrompt, wasAppInstalled)
  return { hasPrompt, installedNow, install: promptInstall }
}
