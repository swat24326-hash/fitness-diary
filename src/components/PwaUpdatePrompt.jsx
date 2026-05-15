import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  })

  // If the user is offline, still allow refresh when online.
  useEffect(() => {
    if (!needRefresh) return
    const onOnline = () => {
      // noop: keeps banner visible
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [needRefresh])

  if (!needRefresh) return null

  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <div className="pwa-update__text">
        Доступна новая версия.
        {!navigator.onLine && <span className="muted"> Сейчас офлайн — обновление применится при появлении интернета.</span>}
      </div>
      <div className="pwa-update__actions">
        <button type="button" className="btn btn-primary btn-touch" onClick={() => updateServiceWorker(true)}>
          Обновить
        </button>
        <button type="button" className="btn btn-ghost btn-touch" onClick={() => updateServiceWorker(false)}>
          Позже
        </button>
      </div>
    </div>
  )
}

