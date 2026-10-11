import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCoachScheduleRange } from '../../lib/coach/coachApiClient.js'
import { CoachSessionGoneError } from '../../lib/coach/coachSession.js'
import { useCoachApp } from './CoachAppContext.jsx'

const EMPTY = { entries: [], clientNameById: {}, trainingById: {}, clients: [] }

/**
 * Ежедневник телефона за окно from–to: только с сервера. При смене окна старые записи видны до ответа,
 * поздний ответ прошлого окна не затирает новый. Вернулись в приложение — тихо подтягивает правки планшета
 * (без крутилки; нет сети — остаётся то, что на экране).
 */
export function useCoachScheduleData(from, to) {
  const { onSessionGone } = useCoachApp()
  const [state, setState] = useState({ data: EMPTY, status: 'loading', error: '' })
  const seqRef = useRef(0)

  const load = useCallback(
    (quiet) => {
      const seq = ++seqRef.current
      if (!quiet) setState((s) => ({ ...s, status: 'loading', error: '' }))
      return fetchCoachScheduleRange(from, to)
        .then((data) => {
          if (seq !== seqRef.current) return
          setState({ data: { ...EMPTY, ...data }, status: 'ready', error: '' })
        })
        .catch((e) => {
          if (seq !== seqRef.current) return
          if (e instanceof CoachSessionGoneError) onSessionGone(e.message)
          else if (!quiet) setState((s) => ({ ...s, status: 'error', error: e?.message || 'Не загрузилось' }))
        })
    },
    [from, to, onSessionGone],
  )
  const reload = useCallback(() => load(false), [load])

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  return { ...state.data, status: state.status, error: state.error, reload }
}
