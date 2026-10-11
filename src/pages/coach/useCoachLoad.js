import { useCallback, useEffect, useRef, useState } from 'react'
import { CoachSessionGoneError } from '../../lib/coach/coachSession.js'
import { useCoachApp } from './CoachAppContext.jsx'

/**
 * Загрузка данных экрана телефона: только с сервера, без кэша. Вход закончился — на экран входа.
 * refreshOnReturn — вернулись в приложение: тихо подтянуть свежее (без крутилки; нет сети — остаётся экран).
 * @template T
 * @param {() => Promise<T>} fetcher
 * @param {{ refreshOnReturn?: boolean }} [opts]
 */
export function useCoachLoad(fetcher, { refreshOnReturn = false } = {}) {
  const { onSessionGone } = useCoachApp()
  const [state, setState] = useState({ data: /** @type {T | null} */ (null), status: 'loading', error: '' })
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher

  const load = useCallback(
    (quiet) => {
      if (!quiet) setState((s) => ({ ...s, status: 'loading', error: '' }))
      return fetchRef
        .current()
        .then((data) => setState({ data, status: 'ready', error: '' }))
        .catch((e) => {
          if (e instanceof CoachSessionGoneError) onSessionGone(e.message)
          else if (!quiet) setState((s) => ({ ...s, status: 'error', error: e?.message || 'Не загрузилось' }))
        })
    },
    [onSessionGone],
  )
  const reload = useCallback(() => load(false), [load])

  useEffect(() => {
    void load(false)
  }, [load])

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
