import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { hasCoachSession, signOutCoach } from '../../lib/coach/coachSession.js'

const CoachAppContext = createContext(null)

/** Вошёл ли телефон и почему вышел (отозван, блок) — для экрана входа. */
export function CoachAppProvider({ children }) {
  const [signedIn, setSignedIn] = useState(hasCoachSession)
  const [notice, setNotice] = useState('')

  const onSignedIn = useCallback(() => {
    setNotice('')
    setSignedIn(true)
  }, [])

  const onSessionGone = useCallback((message) => {
    setNotice(message || 'Вход закончился — войдите снова')
    setSignedIn(false)
  }, [])

  const signOut = useCallback(async () => {
    await signOutCoach()
    setNotice('')
    setSignedIn(false)
  }, [])

  const value = useMemo(
    () => ({ signedIn, notice, onSignedIn, onSessionGone, signOut }),
    [signedIn, notice, onSignedIn, onSessionGone, signOut],
  )
  return <CoachAppContext.Provider value={value}>{children}</CoachAppContext.Provider>
}

export function useCoachApp() {
  const ctx = useContext(CoachAppContext)
  if (!ctx) throw new Error('useCoachApp вне CoachAppProvider')
  return ctx
}
