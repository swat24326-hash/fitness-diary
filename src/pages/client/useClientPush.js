import { useCallback, useEffect, useState } from 'react'
import { isIosUserAgent } from '../../lib/client/clientInstallCore.js'
import { clientPushMode } from '../../lib/client/clientPushModeCore.js'
import { postClientMe } from '../../lib/client/clientSession.js'
import { isTrainerPushSupported, serializePushSubscription } from '../../lib/push/trainerPushCore.js'
import { formatPushSubscribeError, subscribePushManager } from '../../lib/push/trainerPushSubscribe.js'

function permissionNow() {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission
}

async function currentEndpoint() {
  if (!isTrainerPushSupported()) return ''
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return sub?.endpoint ?? ''
}

/**
 * Напоминания о тренировке на этот телефон. Браузерную подписку при выключении не снимаем:
 * service worker общий с приложением зала, снимаем только запись на сервере.
 * @param {{ active: boolean, standalone: boolean }} opts active — клиент вошёл и данные загружены
 */
export function useClientPush({ active, standalone }) {
  const [server, setServer] = useState({ configured: false, publicKey: '', subscribed: false, endpoint: '' })
  const [permission, setPermission] = useState(permissionNow)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    ;(async () => {
      const endpoint = await currentEndpoint().catch(() => '')
      const st = await postClientMe({ action: 'push-status', endpoint })
      if (cancelled) return
      setServer({ configured: !!st.configured, publicKey: st.public_key || '', subscribed: !!st.subscribed, endpoint })
      setPermission(permissionNow())
    })().catch(() => {
      /* нет связи — карточку просто не показываем */
    })
    return () => {
      cancelled = true
    }
  }, [active])

  const enable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      // Safari спрашивает разрешение только прямо из касания — до любых других await.
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return
      const ser = serializePushSubscription(await subscribePushManager(server.publicKey))
      if (!ser.ok) throw new Error(ser.error)
      await postClientMe({ action: 'push-subscribe', ...ser.payload })
      setServer((s) => ({ ...s, subscribed: true, endpoint: ser.payload.endpoint }))
    } catch (e) {
      setError(formatPushSubscribeError(e))
    } finally {
      setBusy(false)
    }
  }, [server.publicKey])

  const disable = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      await postClientMe({ action: 'push-unsubscribe', endpoint: server.endpoint })
      setServer((s) => ({ ...s, subscribed: false }))
    } catch (e) {
      setError(e?.message || 'Не получилось — попробуйте ещё раз')
    } finally {
      setBusy(false)
    }
  }, [server.endpoint])

  const mode = clientPushMode({
    configured: server.configured,
    supported: isTrainerPushSupported(),
    ios: isIosUserAgent(navigator.userAgent, navigator.maxTouchPoints),
    standalone,
    permission,
    subscribed: server.subscribed,
  })
  return { mode, busy, error, enable, disable }
}
