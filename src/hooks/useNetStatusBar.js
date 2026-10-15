import { useEffect, useState } from 'react'
import { NET_BAR_DELAY_MS, NET_BAR_PROBE_MS, netStatusBarShown, netStatusBarState } from '../lib/net/netStatusBarCore.js'
import { CLOUD_STATUS_EVENT, fetchWithAppTimeout, isBrowserOnline, isCloudConfirmed } from '../lib/networkReachability.js'

const read = () => netStatusBarState({ browserOnline: isBrowserOnline(), cloudConfirmed: isCloudConfirmed() })

/** Любой ответ сервера (даже 404) = связь есть; отметку ставит fetchWithAppTimeout. */
function probe() {
  if (typeof window === 'undefined' || !isBrowserOnline()) return
  void fetchWithAppTimeout(`${window.location.origin}/api/health`, { cache: 'no-store' }, NET_BAR_PROBE_MS).catch(() => {})
}

/**
 * Задержка против мигания — только на смену состояния; открыли экран уже без сети — плашка сразу
 * (оболочка монтируется заново на каждом экране).
 * @returns {'offline' | 'connecting' | null} что показать в плашке
 */
export function useNetStatusBar() {
  const [cur, setCur] = useState(() => ({ state: read(), since: 0 }))
  const [, tick] = useState(0)

  useEffect(() => {
    const update = () => setCur((c) => {
      const state = read()
      return state === c.state ? c : { state, since: Date.now() }
    })
    const onOnline = () => {
      update()
      probe()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', update)
    window.addEventListener(CLOUD_STATUS_EVENT, update)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', update)
      window.removeEventListener(CLOUD_STATUS_EVENT, update)
    }
  }, [])

  useEffect(() => {
    if (cur.state === 'hidden') return undefined
    const show = window.setTimeout(() => tick((n) => n + 1), NET_BAR_DELAY_MS)
    const again = cur.state === 'connecting' ? window.setInterval(probe, NET_BAR_PROBE_MS) : 0
    return () => {
      window.clearTimeout(show)
      if (again) window.clearInterval(again)
    }
  }, [cur])

  return netStatusBarShown(cur.state, cur.since, Date.now()) ? cur.state : null
}
