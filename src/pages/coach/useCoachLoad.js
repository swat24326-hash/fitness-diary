import { useCallback, useEffect, useRef, useState } from 'react'
import { CoachSessionGoneError } from '../../lib/coach/coachSession.js'
import { peekScreenCache, readScreenCache, writeScreenCache } from '../../lib/screenCache/screenCacheStore.js'
import { useCoachApp } from './CoachAppContext.jsx'

/**
 * Загрузка данных экрана телефона. Вход закончился — на экран входа.
 * cacheKey — кэш экрана (screenCacheKey): сначала сохранённое на телефоне, затем сервер; сеть не ответила,
 * а сохранённое есть — status 'stale' (экран остаётся, вместо ошибки — плашка «Нет сети» в оболочке).
 * refreshOnReturn — вернулись в приложение: тихо подтянуть свежее (без крутилки; нет сети — остаётся экран).
 * @template T
 * @param {() => Promise<T>} fetcher
 * @param {{ refreshOnReturn?: boolean, cacheKey?: string }} [opts]
 */
export function useCoachLoad(fetcher, { refreshOnReturn = false, cacheKey = '' } = {}) {
  const { onSessionGone } = useCoachApp()
  const [state, setState] = useState(() => ({
    data: /** @type {T | null} */ ((cacheKey && peekScreenCache(cacheKey)) || null),
    status: 'loading',
    error: '',
  }))
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  const freshRef = useRef(false)

  const load = useCallback(
    (quiet) => {
      if (!quiet) setState((s) => ({ ...s, status: 'loading', error: '' }))
      return fetchRef
        .current()
        .then((data) => {
          freshRef.current = true
          setState({ data, status: 'ready', error: '' })
          if (cacheKey) void writeScreenCache(cacheKey, data)
        })
        .catch((e) => {
          if (e instanceof CoachSessionGoneError) onSessionGone(e.message)
          else if (!quiet) {
            const error = e?.message || 'Не загрузилось'
            setState((s) => ({ ...s, status: s.data ? 'stale' : 'error', error }))
          }
        })
    },
    [onSessionGone, cacheKey],
  )
  const reload = useCallback(() => load(false), [load])

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    if (!cacheKey) return undefined
    let alive = true
    void readScreenCache(cacheKey).then((data) => {
      if (!alive || data == null || freshRef.current) return
      setState((s) => (s.data ? s : { ...s, data, status: s.status === 'error' ? 'stale' : s.status }))
    })
    return () => {
      alive = false
    }
  }, [cacheKey])

  useEffect(() => {
    if (!refreshOnReturn) return undefined
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load, refreshOnReturn])

  return { ...state, reload }
}
