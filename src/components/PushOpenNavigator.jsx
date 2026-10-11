import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { requestOpenTrainerInbox } from '../lib/admin/trainerInboxEvents.js'
import { PUSH_OPEN_TYPE, pushOpenAction } from '../lib/push/pushOpenCore.js'

/** Нажали на push при открытом приложении — открыть сам диалог (или Планёрку), как при холодном запуске. */
export function PushOpenNavigator() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentRef = useRef('')
  currentRef.current = `${location.pathname}${location.search}`

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined
    const onMessage = (event) => {
      if (event?.data?.type !== PUSH_OPEN_TYPE) return
      const action = pushOpenAction(event.data.url, currentRef.current)
      if (action?.kind === 'inbox') requestOpenTrainerInbox()
      else if (action?.kind === 'navigate') navigate(action.to)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  return null
}
