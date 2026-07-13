import { useCallback, useEffect, useState } from 'react'
import { getAccessTokenForAdminApi } from '../lib/admin/adminApiClient.js'
import {
  isTrainerPushSupported,
  serializePushSubscription,
  urlBase64ToUint8Array,
} from '../lib/push/trainerPushCore.js'
import {
  removeTrainerPushSubscription,
  saveTrainerPushSubscription,
  sendTrainerPushTest,
} from '../lib/push/trainerPushService.js'

const PROMPT_DISMISS_KEY = 'trainer_push_prompt_dismissed_v1'

async function fetchVapidPublicKey() {
  const fromEnv = String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()
  if (fromEnv) return fromEnv

  const token = await getAccessTokenForAdminApi()
  if (!token) return ''
  const res = await fetch(`${window.location.origin}/api/admin-data?action=push-subscription`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (!res.ok) return ''
  const data = await res.json().catch(() => ({}))
  return String(data?.public_key ?? '').trim()
}

/**
 * @param {{ clubId?: string, autoRegister?: boolean }} [opts]
 */
export function useTrainerPush(opts = {}) {
  const clubId = String(opts.clubId ?? '').trim()
  const [supported] = useState(() => isTrainerPushSupported())
  const [permission, setPermission] = useState(
    () => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'),
  )
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [configured, setConfigured] = useState(true)

  const refreshState = useCallback(async () => {
    if (!supported) {
      setSubscribed(false)
      return
    }
    setPermission(Notification.permission)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setSubscribed(!!sub)
    } catch {
      setSubscribed(false)
    }
  }, [supported])

  useEffect(() => {
    void refreshState()
  }, [refreshState])

  const subscribe = useCallback(async () => {
    if (!supported) {
      setError('Браузер не поддерживает push-уведомления')
      return false
    }
    setBusy(true)
    setError('')
    try {
      const publicKey = await fetchVapidPublicKey()
      if (!publicKey) {
        setConfigured(false)
        setError('Push ещё не настроен на сервере. Задания доступны в Планёрке как обычно.')
        return false
      }
      setConfigured(true)

      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setError('Разрешите уведомления в настройках планшета')
        return false
      }

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        })
      }

      const serialized = serializePushSubscription(sub)
      if (!serialized.ok) throw new Error(serialized.error)

      await saveTrainerPushSubscription({
        clubId,
        endpoint: serialized.payload.endpoint,
        p256dh: serialized.payload.p256dh,
        auth: serialized.payload.auth,
        userAgent: serialized.payload.user_agent,
      })

      setSubscribed(true)
      localStorage.setItem(PROMPT_DISMISS_KEY, '1')
      return true
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось включить уведомления')
      return false
    } finally {
      setBusy(false)
    }
  }, [clubId, supported])

  const unsubscribe = useCallback(async () => {
    if (!supported) return false
    setBusy(true)
    setError('')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        try {
          await removeTrainerPushSubscription(endpoint)
        } catch {
          /* offline */
        }
      }
      setSubscribed(false)
      return true
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Не удалось отключить уведомления')
      return false
    } finally {
      setBusy(false)
    }
  }, [supported])

  const testPush = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const data = await sendTrainerPushTest()
      if (!data?.sent) {
        setError('Сначала включите уведомления на этом планшете')
        return false
      }
      return true
    } catch (e) {
      setError(e?.message ? String(e.message) : 'Тест не удался')
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    supported,
    permission,
    subscribed,
    busy,
    error,
    configured,
    subscribe,
    unsubscribe,
    testPush,
    refreshState,
    shouldShowPrompt: () =>
      supported &&
      permission === 'default' &&
      !subscribed &&
      !localStorage.getItem(PROMPT_DISMISS_KEY),
    dismissPrompt: () => localStorage.setItem(PROMPT_DISMISS_KEY, '1'),
  }
}
