import { useCallback, useEffect, useRef, useState } from 'react'
import { CoachSessionGoneError } from '../../lib/coach/coachSession.js'
import { useCoachApp } from './CoachAppContext.jsx'

/**
 * Загрузка данных экрана телефона: только с сервера, без кэша. Вход закончился — на экран входа.
 * @template T
 * @param {() => Promise<T>} fetcher
 */
export function useCoachLoad(fetcher) {
  const { onSessionGone } = useCoachApp()
  const [state, setState] = useState({ data: /** @type {T | null} */ (null), status: 'loading', error: '' })
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher

  const reload = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: '' }))
    return fetchRef
      .current()
      .then((data) => setState({ data, status: 'ready', error: '' }))
      .catch((e) => {
        if (e instanceof CoachSessionGoneError) onSessionGone(e.message)
        else setState((s) => ({ ...s, status: 'error', error: e?.message || 'Не загрузилось' }))
      })
  }, [onSessionGone])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload }
}
