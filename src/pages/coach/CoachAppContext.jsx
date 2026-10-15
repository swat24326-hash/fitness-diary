import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fetchCoachMe } from '../../lib/coach/coachApiClient.js'
import { hasCoachSession, readCoachClub, saveCoachClub, signOutCoach } from '../../lib/coach/coachSession.js'
import { purgeScreenCache } from '../../lib/screenCache/screenCacheStore.js'

const CoachAppContext = createContext(null)

/** Вошёл ли телефон и почему вышел (отозван, блок) — для экрана входа; клуб — название значка. */
export function CoachAppProvider({ children }) {
  const [signedIn, setSignedIn] = useState(hasCoachSession)
  const [notice, setNotice] = useState('')
  const [club, setClub] = useState(readCoachClub)

  useEffect(() => void purgeScreenCache(), [])

  useEffect(() => {
    if (!signedIn) return undefined
    let alive = true
    fetchCoachMe()
      .then((me) => {
        if (!alive) return
        saveCoachClub(me?.club)
        setClub(me?.club?.name ? me.club : null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [signedIn])

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
    () => ({ signedIn, notice, club, onSignedIn, onSessionGone, signOut }),
    [signedIn, notice, club, onSignedIn, onSessionGone, signOut],
  )
  return <CoachAppContext.Provider value={value}>{children}</CoachAppContext.Provider>
}

export function useCoachApp() {
  const ctx = useContext(CoachAppContext)
  if (!ctx) throw new Error('useCoachApp вне CoachAppProvider')
  return ctx
}
