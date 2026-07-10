import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { stopGeminiSpeech } from '../lib/geminiAnalyticsSpeech.js'

/** @typedef {{ trainerId?: string | null, trainerName?: string, clubId?: string | null, initialMessage?: string | null }} OpenIskraOpts */

const IskraPanelContext = createContext(null)

export function IskraPanelProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [open, setOpen] = useState(false)
  const [trainerId, setTrainerId] = useState(null)
  const [trainerName, setTrainerName] = useState('')
  const [initialMessage, setInitialMessage] = useState(null)

  const openIskra = useCallback(
    (opts = {}) => {
      const clubId = String(opts.clubId ?? '').trim()
      const currentClub = String(searchParams.get('club') ?? '').trim()
      if (clubId && clubId !== currentClub) {
        const next = new URLSearchParams(searchParams)
        next.set('club', clubId)
        setSearchParams(next, { replace: false })
      }
      setTrainerId(opts.trainerId ? String(opts.trainerId).trim() : null)
      setTrainerName(String(opts.trainerName ?? '').trim())
      setInitialMessage(opts.initialMessage ? String(opts.initialMessage).trim() : null)
      setOpen(true)
    },
    [searchParams, setSearchParams],
  )

  const closeIskra = useCallback(() => {
    stopGeminiSpeech()
    setOpen(false)
    setTrainerId(null)
    setTrainerName('')
    setInitialMessage(null)
  }, [])

  const value = useMemo(
    () => ({
      open,
      trainerId,
      trainerName,
      initialMessage,
      openIskra,
      closeIskra,
    }),
    [open, trainerId, trainerName, initialMessage, openIskra, closeIskra],
  )

  return <IskraPanelContext.Provider value={value}>{children}</IskraPanelContext.Provider>
}

export function useIskraPanel() {
  const ctx = useContext(IskraPanelContext)
  if (!ctx) throw new Error('useIskraPanel вне IskraPanelProvider')
  return ctx
}
