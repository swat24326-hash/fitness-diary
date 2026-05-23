import { useCallback, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

function postSkipWaiting(registration) {
  const waiting = registration?.waiting
  if (!waiting) return false
  waiting.postMessage({ type: 'SKIP_WAITING' })
  return true
}

export function PwaUpdatePrompt() {
  const [updating, setUpdating] = useState(false)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registration?.update().catch(() => {})
    },
  })

  const applyUpdate = useCallback(async () => {
    if (updating) return
    setUpdating(true)
    try {
      const registration = await navigator.serviceWorker?.getRegistration?.()
      postSkipWaiting(registration)

      await Promise.race([
        updateServiceWorker(true).catch((e) => {
          console.warn('[PWA] updateServiceWorker failed', e)
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ])

      if (registration?.waiting) {
        postSkipWaiting(registration)
      }

      await new Promise((resolve) => {
        const sw = navigator.serviceWorker
        if (!sw) {
          resolve(undefined)
          return
        }
        const done = () => {
          sw.removeEventListener('controllerchange', done)
          resolve(undefined)
        }
        sw.addEventListener('controllerchange', done, { once: true })
        setTimeout(done, 1500)
      })
    } finally {
      setNeedRefresh(false)
      window.location.reload()
    }
  }, [updateServiceWorker, setNeedRefresh, updating])

  if (!needRefresh) return null

  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <div className="pwa-update__text">
        Доступна новая версия.
        {!navigator.onLine && (
          <span className="muted"> Сейчас офлайн — обновление применится при появлении интернета.</span>
        )}
      </div>
      <div className="pwa-update__actions">
        <button
          type="button"
          className="btn btn-primary btn-touch"
          disabled={updating}
          onClick={() => void applyUpdate()}
        >
          {updating ? 'Обновление…' : 'Обновить'}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-touch"
          disabled={updating}
          onClick={() => setNeedRefresh(false)}
        >
          Позже
        </button>
      </div>
    </div>
  )
}
