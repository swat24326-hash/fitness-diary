import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCoachScheduleRange } from '../../lib/coach/coachApiClient.js'
import { CoachSessionGoneError } from '../../lib/coach/coachSession.js'
import { screenCacheKey } from '../../lib/screenCache/screenCacheCore.js'
import { peekScreenCache, readScreenCache, writeScreenCache } from '../../lib/screenCache/screenCacheStore.js'
import { useCoachApp } from './CoachAppContext.jsx'

const EMPTY = { entries: [], clientNameById: {}, clientInfoById: {}, trainingById: {}, clients: [], az_directions: [] }

/**
 * Ежедневник телефона за окно from–to. Окно уже открывали — сразу сохранённое на телефоне (кэш экранов),
 * затем сервер. Нет кэша окна — старые записи видны до ответа, поздний ответ прошлого окна не затирает новый.
 * Сеть не ответила: есть данные этого окна — status 'stale' (экран остаётся), нет — ошибка, а не чужая неделя.
 * Вернулись в приложение — тихо подтягивает правки планшета.
 */
export function useCoachScheduleData(from, to) {
  const { onSessionGone } = useCoachApp()
  const cacheKey = screenCacheKey('coach', 'schedule', `${from}_${to}`)
  const [state, setState] = useState(() => {
    const hit = peekScreenCache(cacheKey)
    return { data: hit ?? EMPTY, dataKey: hit ? cacheKey : '', status: 'loading', error: '' }
  })
  const seqRef = useRef(0)

  const load = useCallback(
    (quiet) => {
      const seq = ++seqRef.current
      if (!quiet) setState((s) => ({ ...s, status: 'loading', error: '' }))
      return fetchCoachScheduleRange(from, to)
        .then((data) => {
          if (seq !== seqRef.current) return
          setState({ data: { ...EMPTY, ...data }, dataKey: cacheKey, status: 'ready', error: '' })
          void writeScreenCache(cacheKey, data)
        })
        .catch((e) => {
          if (seq !== seqRef.current) return
          if (e instanceof CoachSessionGoneError) onSessionGone(e.message)
          else if (!quiet) {
            const error = e?.message || 'Не загрузилось'
            setState((s) => ({ ...s, status: s.dataKey === cacheKey ? 'stale' : 'error', error }))
          }
        })
    },
    [from, to, cacheKey, onSessionGone],
  )
  const reload = useCallback(() => load(false), [load])

  useEffect(() => {
    const seq = seqRef.current + 1
    const hit = peekScreenCache(cacheKey)
    if (hit) setState((s) => ({ ...s, data: { ...EMPTY, ...hit }, dataKey: cacheKey }))
    else
      void readScreenCache(cacheKey).then((data) => {
        if (data == null || seqRef.current !== seq) return
        setState((s) => (s.status === 'ready' ? s : { ...s, data: { ...EMPTY, ...data }, dataKey: cacheKey, status: s.status === 'error' ? 'stale' : s.status }))
      })
    void load(false)
  }, [cacheKey, load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  return { ...state.data, status: state.status, error: state.error, reload }
}
