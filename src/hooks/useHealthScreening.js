import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { LOCAL_DATA_CHANGED } from '../lib/localDataEvents.js'
import { loadHealthScreening, saveHealthScreening } from '../lib/health/healthScreeningService.js'

/**
 * Анкета здоровья клиента из локальной базы. save — сразу на экране и по очереди в базу
 * (быстрые нажатия подряд не теряют друг друга; офлайн — через очередь sync).
 */
export function useHealthScreening(client) {
  const { user, isAdmin, isTrainer } = useAuth()
  const clientId = String(client?.id ?? '')
  const [state, setState] = useState({ loaded: false, answers: null })
  const [error, setError] = useState('')
  const rowRef = useRef(null)
  const chainRef = useRef(Promise.resolve())
  const pendingRef = useRef(0)
  const versionRef = useRef(0)

  const reload = useCallback(async () => {
    if (pendingRef.current > 0) return
    const version = versionRef.current
    const row = await loadHealthScreening(clientId)
    if (pendingRef.current > 0 || versionRef.current !== version) return
    rowRef.current = row
    setState({ loaded: true, answers: row?.answers ?? null })
  }, [clientId])

  useEffect(() => {
    void reload()
    window.addEventListener(LOCAL_DATA_CHANGED, reload)
    return () => window.removeEventListener(LOCAL_DATA_CHANGED, reload)
  }, [reload])

  const save = useCallback(
    (answers) => {
      setError('')
      setState({ loaded: true, answers })
      versionRef.current += 1
      pendingRef.current += 1
      chainRef.current = chainRef.current.then(async () => {
        try {
          rowRef.current = await saveHealthScreening({ client, userId: user?.id, prev: rowRef.current, answers })
        } catch (e) {
          setError(e?.message || 'Не удалось сохранить анкету')
        } finally {
          pendingRef.current -= 1
        }
      })
      return chainRef.current
    },
    [client, user?.id],
  )

  return {
    ...state,
    error,
    save,
    userId: user?.id ?? null,
    canEdit: Boolean(client?.id && user?.id && (isAdmin || isTrainer) && !client?.archived_at),
  }
}
