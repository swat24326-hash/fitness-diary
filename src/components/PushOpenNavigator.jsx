import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { requestOpenTrainerInbox } from '../lib/admin/trainerInboxEvents.js'
import { PUSH_OPEN_TYPE, pushAppOfPath, pushOpenAction } from '../lib/push/pushOpenCore.js'
import { clearPushShadeForApp } from '../lib/push/pushShadeClear.js'

/** Нажали на push при открытом приложении — открыть сам диалог (или Планёрку), как при холодном запуске. */
export function PushOpenNavigator() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentRef = useRef('')
  currentRef.current = `${location.pathname}${location.search}`
  const app = pushAppOfPath(location.pathname)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return undefined
    const onMessage = (event) => {
      if (event?.data?.type !== PUSH_OPEN_TYPE) return
      const action = pushOpenAction(event.data.url, currentRef.current)
      if (action?.kind === 'inbox') requestOpenTrainerInbox({ tab: 'planerka' })
      else if (action?.kind === 'navigate') navigate(action.to)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  /* Зашли в приложение с иконки / вернулись с фона — плашки этого приложения в шторке гаснут. */
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const clear = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return
      void clearPushShadeForApp(app)
    }
    clear()
    document.addEventListener('visibilitychange', clear)
    window.addEventListener('focus', clear)
    return () => {
      document.removeEventListener('visibilitychange', clear)
      window.removeEventListener('focus', clear)
    }
  }, [app])

  return null
}
