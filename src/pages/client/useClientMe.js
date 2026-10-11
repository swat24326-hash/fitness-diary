import { useCallback, useEffect, useState } from 'react'
import {
  ClientSessionGoneError,
  fetchClientMe,
  hasClientSession,
  logoutClient,
  readClientMeCache,
} from '../../lib/client/clientSession.js'
import { onPushReceived } from '../../lib/push/pushReceivedSignal.js'

const QUIET_REFRESH_MS = 60_000

/**
 * Данные /me: сначала кэш (мгновенно и без сети), затем свежий ответ сервера.
 * @returns {{ data: object|null, savedAt: string|null, status: 'loading'|'ready'|'offline'|'signed_out', error: string, reload: () => void, logout: () => Promise<void> }}
 */
export function useClientMe() {
  const [state, setState] = useState(() => {
    if (!hasClientSession()) return { data: null, savedAt: null, status: 'signed_out', error: '' }
    const cached = readClientMeCache()
    return { data: cached?.data ?? null, savedAt: cached?.saved_at ?? null, status: 'loading', error: '' }
  })

  const reload = useCallback(() => {
    if (!hasClientSession()) {
      setState({ data: null, savedAt: null, status: 'signed_out', error: '' })
      return
    }
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    fetchClientMe()
      .then((data) => setState({ data, savedAt: null, status: 'ready', error: '' }))
      .catch((e) => {
        if (e instanceof ClientSessionGoneError) {
          setState({ data: null, savedAt: null, status: 'signed_out', error: e.message || '' })
          return
        }
        setState((s) => ({ ...s, status: 'offline', error: e?.message || 'Нет связи с сервером' }))
      })
  }, [])

  /* Тихо, без «загрузки» и без «нет связи»: только чтобы число на конверте не ждало ручного обновления. */
  const refreshQuietly = useCallback(() => {
    if (!hasClientSession() || document.visibilityState !== 'visible') return
    fetchClientMe()
      .then((data) => setState({ data, savedAt: null, status: 'ready', error: '' }))
      .catch((e) => {
        if (e instanceof ClientSessionGoneError) setState({ data: null, savedAt: null, status: 'signed_out', error: e.message || '' })
      })
  }, [])

  useEffect(() => {
    reload()
    const onOnline = () => reload()
    window.addEventListener('online', onOnline)
    const t = window.setInterval(refreshQuietly, QUIET_REFRESH_MS)
    document.addEventListener('visibilitychange', refreshQuietly)
    const offPush = onPushReceived(refreshQuietly)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', refreshQuietly)
      offPush()
    }
  }, [reload, refreshQuietly])

  const logout = useCallback(async () => {
    await logoutClient()
    setState({ data: null, savedAt: null, status: 'signed_out', error: '' })
  }, [])

  return { ...state, reload, logout }
}
