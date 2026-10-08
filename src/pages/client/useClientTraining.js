import { useCallback, useRef, useState } from 'react'
import { fetchClientTraining } from '../../lib/client/clientSession.js'

/** Окно тренировки на /me/trainings: загрузка по нажатию, повторное открытие — из памяти. */
export function useClientTraining() {
  const cache = useRef(new Map())
  const [training, setTraining] = useState(null)
  const [pendingId, setPendingId] = useState('')
  const [error, setError] = useState('')

  const open = useCallback(async (id) => {
    setError('')
    const hit = cache.current.get(id)
    if (hit) {
      setTraining(hit)
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('Нет связи — тренировку можно открыть, когда появится интернет')
      return
    }
    setPendingId(id)
    try {
      const t = await fetchClientTraining(id)
      cache.current.set(id, t)
      setTraining(t)
    } catch (e) {
      setError(e?.message && !/fetch|network/i.test(e.message) ? e.message : 'Не удалось открыть тренировку — попробуйте ещё раз')
    } finally {
      setPendingId('')
    }
  }, [])

  const close = useCallback(() => setTraining(null), [])

  return { training, pendingId, error, open, close }
}
