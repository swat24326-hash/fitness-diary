import { useCallback, useEffect, useState } from 'react'
import { LOCAL_DATA_CHANGED } from '../lib/dataAccess'
import { getSyncOutboundSummary, isAppOnline } from '../lib/syncService'
import { isSupabaseConfigured } from '../lib/supabase'

/**
 * Счётчик очереди sync для баннеров (главная тренера и т.д.).
 * @param {{ enabled?: boolean, debounceMs?: number, queueOnly?: boolean }} [opts]
 * `queueOnly` — только длина sync_queue, без тяжёлого getAll (экран тренировки).
 */
export function useSyncOutboundPoll(opts = {}) {
  const { enabled = true, debounceMs = 900, queueOnly = false } = opts
  const [queue, setQueue] = useState(0)
  const [localOnly, setLocalOnly] = useState(0)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!enabled || !isSupabaseConfigured()) {
      setQueue(0)
      setLocalOnly(0)
      setReady(true)
      return
    }
    try {
      const s = await getSyncOutboundSummary(queueOnly ? { queueOnly: true } : {})
      setQueue(s.queue)
      setLocalOnly(s.localOnly)
    } catch {
      setQueue(0)
      setLocalOnly(0)
    } finally {
      setReady(true)
    }
  }, [enabled, queueOnly])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    const onData = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void refresh()
      }, debounceMs)
    }
    window.addEventListener(LOCAL_DATA_CHANGED, onData)
    const onOnline = () => {
      if (isAppOnline()) void refresh()
    }
    window.addEventListener('online', onOnline)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener(LOCAL_DATA_CHANGED, onData)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled, debounceMs, refresh])

  const total = queue + localOnly

  return { queue, localOnly, total, hasPending: total > 0, ready, refresh }
}
