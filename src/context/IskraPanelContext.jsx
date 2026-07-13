import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { stopGeminiSpeech } from '../lib/geminiAnalyticsSpeech.js'

/** @typedef {'closed'|'compact'|'expanded'} IskraPanelMode */

/** @typedef {{ trainerId?: string | null, trainerName?: string, clubId?: string | null, initialMessage?: string | null, mode?: IskraPanelMode }} OpenIskraOpts */

const IskraPanelContext = createContext(null)

export function IskraPanelProvider({ children }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState(/** @type {IskraPanelMode} */ ('closed'))
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
      const nextMode = opts.mode === 'compact' ? 'compact' : 'expanded'
      setMode(nextMode)
    },
    [searchParams, setSearchParams],
  )

  const expandIskra = useCallback(() => {
    setMode('expanded')
  }, [])

  const minimizeIskra = useCallback(() => {
    setMode((m) => (m === 'expanded' ? 'compact' : m))
  }, [])

  const closeIskra = useCallback(() => {
    stopGeminiSpeech()
    setMode('closed')
    setTrainerId(null)
    setTrainerName('')
    setInitialMessage(null)
  }, [])

  const value = useMemo(
    () => ({
      mode,
      open: mode !== 'closed',
      trainerId,
      trainerName,
      initialMessage,
      openIskra,
      expandIskra,
      minimizeIskra,
      closeIskra,
    }),
    [mode, trainerId, trainerName, initialMessage, openIskra, expandIskra, minimizeIskra, closeIskra],
  )

  return <IskraPanelContext.Provider value={value}>{children}</IskraPanelContext.Provider>
}

export function useIskraPanel() {
  const ctx = useContext(IskraPanelContext)
  if (!ctx) throw new Error('useIskraPanel вне IskraPanelProvider')
  return ctx
}
