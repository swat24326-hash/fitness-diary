import { createContext, useContext, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { hasClientSession } from '../../lib/client/clientSession.js'
import { bootScreenCache } from '../../lib/screenCache/screenCacheStore.js'
import { useClientHandoff, useClientHandoffLaunch } from './useClientHandoff.js'
import { useClientInstall } from './useClientInstall.js'
import { useClientOnboarding } from './useClientOnboarding.js'
import { useClientPush } from './useClientPush.js'

const ClientAppContext = createContext(null)

/** Общее для всех экранов /me: установка, напоминания, баннеры первого входа, вход значка на iPhone. */
export function ClientAppProvider({ children }) {
  useLocation() // после /me/join сессия появляется — перечитать hasClientSession при смене экрана
  const signedIn = hasClientSession()
  useEffect(() => {
    void bootScreenCache('client', hasClientSession)
  }, [])
  const installer = useClientInstall()
  useClientHandoffLaunch({ standalone: installer.installed })
  const push = useClientPush({ active: signedIn, standalone: installer.installed })
  const onboarding = useClientOnboarding({ installMode: installer.mode, pushMode: push.mode })
  /* iPhone: токен в /me/?h=… пока не поставили значок — не только на шаге баннера (иначе «Готово» /
   * «Позже» или уход в правила переписки срывают вход со значка). */
  const handoffToken = useClientHandoff({ active: signedIn && installer.mode === 'ios' })
  return (
    <ClientAppContext.Provider value={{ installer, push, onboarding, handoffToken }}>{children}</ClientAppContext.Provider>
  )
}

/**
 * @returns {{ installer: ReturnType<typeof useClientInstall>, push: ReturnType<typeof useClientPush>,
 *   onboarding: ReturnType<typeof useClientOnboarding>, handoffToken: string }}
 */
export function useClientApp() {
  return useContext(ClientAppContext)
}
