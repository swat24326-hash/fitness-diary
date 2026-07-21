import { useEffect, useRef, useState } from 'react'
import { playIskraInsightChime } from '../../lib/admin/iskraInsightChime.js'

const INSIGHT_MS = 1400

/**
 * Состояние орба ИСКРЫ из listening/loading + краткий insight после ответа.
 * @param {boolean} listening
 * @param {boolean} loading
 * @param {{ chime?: boolean }} [opts] — chime: играть звук insight (если не mute в localStorage)
 * @returns {'idle' | 'listen' | 'think' | 'insight'}
 */
export function useIskraOrbState(listening, loading, opts = {}) {
  const chime = Boolean(opts.chime)
  const [insightFlash, setInsightFlash] = useState(false)
  const wasLoadingRef = useRef(false)

  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true
      setInsightFlash(false)
      return undefined
    }
    if (!wasLoadingRef.current) return undefined
    wasLoadingRef.current = false
    setInsightFlash(true)
    if (chime) playIskraInsightChime()
    const t = window.setTimeout(() => setInsightFlash(false), INSIGHT_MS)
    return () => window.clearTimeout(t)
  }, [loading, chime])

  if (listening) return 'listen'
  if (loading) return 'think'
  if (insightFlash) return 'insight'
  return 'idle'
}
